from typing import TYPE_CHECKING
from uuid import UUID

from tracer.errors.settings_errors import (
    AICredentialStateUncertainError,
    AIProviderNotFoundError,
    AISettingsOperationError,
)

from ..api_key_store import ApiKeyStore
from ..settings_store import SettingsStore

if TYPE_CHECKING:
    from tracer.api.models.settings_models import ReplaceAIProviderKeyRequest


def restore_api_key(
    store: ApiKeyStore, provider_key: UUID, previous_key: str | None
) -> bool:
    """Attempt compensation once, then verify; never expose a stored secret.

    A backend can raise after performing a write. Only a successful read matching
    the previous state confirms restoration, even if the restore call raised.
    """
    try:
        if previous_key is None:
            store.delete(provider_key)
        else:
            store.save(provider_key, previous_key)
    except Exception:
        pass
    try:
        return store.get(provider_key) == previous_key
    except Exception:
        return False


class ReplaceAIProviderKeyService:
    """Replace one credential without writing SQLite; caller holds the router lock."""

    def __init__(self, settings_store: SettingsStore, api_key_store: ApiKeyStore):
        self._settings_store = settings_store
        self._api_key_store = api_key_store

    def replace(self, provider_key: UUID, request: "ReplaceAIProviderKeyRequest") -> None:
        # Validate the complete stored snapshot before touching credentials.
        if self._settings_store.get_provider_by_key(provider_key) is None:
            raise AIProviderNotFoundError("Provider not found.")
        try:
            previous_key = self._api_key_store.get(provider_key)
        except Exception:
            raise AISettingsOperationError(
                "Could not read the existing API key. No replacement was attempted."
            ) from None
        try:
            self._api_key_store.save(provider_key, request.api_key.get_secret_value())
        except Exception:
            if restore_api_key(self._api_key_store, provider_key, previous_key):
                raise AISettingsOperationError(
                    "API key replacement failed. The previous credential state was verified."
                ) from None
            raise AICredentialStateUncertainError(
                "API key replacement failed and the credential state is uncertain."
            ) from None
