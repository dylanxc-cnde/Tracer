import sqlite3
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from tracer.errors.settings_errors import (
    AIProviderCleanupError,
    AIProviderCreationError,
    ApiKeyStoreError,
)

from ..api_key_store import ApiKeyStore
from ..models import AIProviderSettings, AppSettings
from ..settings_store import SettingsStore

if TYPE_CHECKING:
    from tracer.api.models.settings_models import CreateAIProviderRequest


class CreateAIProviderService:
    """Create non-secret settings and the matching system credential.

    Callers must serialize settings writes when this service is exposed to
    concurrent requests. SQLite and the credential store are not one transaction;
    cleanup handles reported failures, not process crashes between writes.
    """

    def __init__(self, settings_store: SettingsStore, api_key_store: ApiKeyStore):
        self._settings_store = settings_store
        self._api_key_store = api_key_store

    def create(self, request: "CreateAIProviderRequest") -> AIProviderSettings:
        """Return the new provider only after both stores have saved it.

        Read and validation failures propagate before any credential is written.
        Write failures trigger credential cleanup; an unconfirmed cleanup raises
        AIProviderCleanupError instead of claiming that everything was reverted.
        """
        settings = self._settings_store.get()
        if settings is None:
            settings = AppSettings()

        provider = AIProviderSettings(
            provider_key=uuid4(),
            provider=request.provider,
            display_name=request.display_name,
            monthly_budget_usd=request.monthly_budget_usd,
        )
        # Build the snapshot from saved settings, never from the secret-bearing request.
        payload = settings.model_dump()
        payload["ai"]["providers"] = (*payload["ai"]["providers"], provider.model_dump())
        updated_settings = AppSettings.model_validate(payload)

        try:
            self._api_key_store.save(provider.provider_key, request.api_key.get_secret_value())
        except ApiKeyStoreError:
            # A backend can report failure after writing; clean up this new UUID too.
            self._remove_new_api_key(provider.provider_key)
            raise AIProviderCreationError(
                "Could not create the provider because its API key could not be saved.",
                context={"provider_key": str(provider.provider_key)},
            ) from None

        try:
            self._settings_store.save(updated_settings)
        except sqlite3.Error:
            self._remove_new_api_key(provider.provider_key)
            raise AIProviderCreationError(
                "Could not save the provider settings. The new API key was removed.",
                context={"provider_key": str(provider.provider_key)},
            ) from None

        return provider

    def _remove_new_api_key(self, provider_key: UUID) -> None:
        try:
            # False means the key is already absent, which also completes cleanup.
            self._api_key_store.delete(provider_key)
        except ApiKeyStoreError:
            raise AIProviderCleanupError(
                "Provider creation failed and API key cleanup could not be confirmed.",
                context={"provider_key": str(provider_key)},
            ) from None
