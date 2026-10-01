from .base_errors import TracerError


class ApiKeyStoreError(TracerError):
    """Credential storage failed; the message excludes backend exception details."""

    code = "settings.api_key_store_error"
