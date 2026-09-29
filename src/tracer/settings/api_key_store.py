import platform
from uuid import UUID

from keyring.backend import KeyringBackend

from tracer.errors.settings_errors import ApiKeyStoreError


_SERVICE_NAME = "tracer.api_keys"


def _create_system_backend() -> KeyringBackend:
    """Use native storage without keyring's configurable plugin fallback."""
    system = platform.system()

    try:
        if system == "Darwin":
            from keyring.backends.macOS import Keyring

            backend = Keyring()
        elif system == "Windows":
            from keyring.backends.Windows import WinVaultKeyring

            backend = WinVaultKeyring()
        elif system == "Linux":
            from keyring.backends.SecretService import Keyring

            backend = Keyring()
        else:
            raise ApiKeyStoreError(
                "System credential storage is not supported on this platform."
            )

        # Native backends use priority to check required libraries and services.
        if backend.priority <= 0:
            raise ApiKeyStoreError("The system credential store is unavailable.")
        return backend
    except ApiKeyStoreError:
        raise
    except Exception:
        raise ApiKeyStoreError(
            "Could not initialize the system credential store. "
            "Check that its required libraries and services are available."
        ) from None


def _credential_username(provider_key: UUID) -> str:
    if not isinstance(provider_key, UUID):
        raise TypeError("provider_key must be a UUID.")
    return str(provider_key)


class ApiKeyStore:
    """Store provider credentials in the current OS user's credential store.

    Only the backend is cached, not API keys. Access is deferred until the
    first operation; unavailable or locked storage raises ApiKeyStoreError.
    Linux requires an available Secret Service session.
    """

    def __init__(self):
        self._backend: KeyringBackend | None = None

    def _get_backend(self) -> KeyringBackend:
        if self._backend is None:
            self._backend = _create_system_backend()
        return self._backend

    def save(self, provider_key: UUID, api_key: str) -> None:
        """Insert or replace a key without altering its contents.

        Empty or whitespace-only keys are rejected. Provider-specific key
        formats and whether the credential works are not validated here.
        """
        username = _credential_username(provider_key)
        if not isinstance(api_key, str):
            raise TypeError("api_key must be a string.")
        if not api_key.strip():
            raise ValueError("api_key must not be empty or whitespace-only.")

        backend = self._get_backend()
        try:
            backend.set_password(_SERVICE_NAME, username, api_key)
        except Exception:
            # Backend exceptions may contain secrets or use platform-specific types.
            raise ApiKeyStoreError(
                "Could not save the API key in the system credential store."
            ) from None

    def get(self, provider_key: UUID) -> str | None:
        """Return the key, or None only when the credential does not exist."""
        username = _credential_username(provider_key)
        backend = self._get_backend()
        try:
            return backend.get_password(_SERVICE_NAME, username)
        except Exception:
            raise ApiKeyStoreError(
                "Could not read the API key from the system credential store."
            ) from None

    def delete(self, provider_key: UUID) -> bool:
        """Return False for a missing key, True after successful deletion.

        Access failures, including failures after the existence check, raise
        ApiKeyStoreError instead of being treated as an absent credential.
        """
        username = _credential_username(provider_key)
        backend = self._get_backend()
        try:
            # PasswordDeleteError can mean denied access, not just a missing key.
            if backend.get_password(_SERVICE_NAME, username) is None:
                return False
            backend.delete_password(_SERVICE_NAME, username)
        except Exception:
            raise ApiKeyStoreError(
                "Could not delete the API key from the system credential store."
            ) from None
        return True
