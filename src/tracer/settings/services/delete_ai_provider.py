from uuid import UUID

from tracer.errors.settings_errors import (
    AICredentialStateUncertainError,
    AIProviderInUseError,
    AIProviderNotFoundError,
    AISettingsOperationError,
    AISettingsStateUncertainError,
)

from ..api_key_store import ApiKeyStore
from ..models import AppSettings
from ..settings_store import SettingsStore
from .replace_ai_provider_key import restore_api_key


class DeleteAIProviderService:
    """Delete an unreferenced provider with bounded, verified compensation.

    This is not an atomic transaction across SQLite and system credentials.
    Callers serialize writes; crashes and other processes are outside this lock.
    """

    def __init__(self, settings_store: SettingsStore, api_key_store: ApiKeyStore):
        self._settings_store = settings_store
        self._api_key_store = api_key_store

    def delete(self, provider_key: UUID) -> None:
        settings = self._settings_store.get()
        if settings is None or not any(
            p.provider_key == provider_key for p in settings.ai.providers
        ):
            raise AIProviderNotFoundError("Provider not found.")
        if any(t.provider_key == provider_key for t in settings.ai.tasks):
            raise AIProviderInUseError("Provider is referenced by a task selection.")
        payload = settings.model_dump()
        payload["ai"]["providers"] = tuple(
            p for p in payload["ai"]["providers"] if p["provider_key"] != provider_key
        )
        updated = AppSettings.model_validate(payload)
        try:
            previous_key = self._api_key_store.get(provider_key)
        except Exception:
            raise AISettingsOperationError(
                "Could not read the existing API key. Deletion was not attempted."
            ) from None

        try:
            # False means already absent, not an access failure.
            self._api_key_store.delete(provider_key)
        except Exception:
            if restore_api_key(self._api_key_store, provider_key, previous_key):
                raise AISettingsOperationError(
                    "Provider deletion failed. The previous credential state was verified."
                ) from None
            raise AICredentialStateUncertainError(
                "Provider deletion failed and the credential state is uncertain."
            ) from None

        try:
            self._settings_store.save(updated)
        except Exception:
            # A save may report failure after commit. Verify or restore SQLite too,
            # rather than claiming that restoring the credential rolls both back.
            settings_restored = self._restore_settings(settings)
            credential_restored = restore_api_key(
                self._api_key_store, provider_key, previous_key
            )
            if not credential_restored:
                raise AICredentialStateUncertainError(
                    "Provider deletion failed and the credential state is uncertain.",
                    context={"settings_restored": settings_restored},
                ) from None
            if not settings_restored:
                raise AISettingsStateUncertainError(
                    "Provider deletion failed. Credentials were restored, but settings could not be verified."
                ) from None
            raise AISettingsOperationError(
                "Provider deletion failed. The previous settings and credential states were verified."
            ) from None

    def _restore_settings(self, previous: AppSettings) -> bool:
        try:
            if self._settings_store.get() == previous:
                return True
        except Exception:
            # An unreadable snapshot must not be overwritten with defaults or a
            # guessed rollback. Report uncertainty and preserve it for recovery.
            return False
        try:
            self._settings_store.save(previous)
        except Exception:
            pass
        try:
            return self._settings_store.get() == previous
        except Exception:
            return False
