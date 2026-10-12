from .base_errors import TracerError


class ApiKeyStoreError(TracerError):
    """Credential storage failed; the message excludes backend exception details."""

    code = "settings.api_key_store_error"


class AIProviderCreationError(TracerError):
    """Provider creation failed; any newly written credential was cleaned up."""

    code = "settings.ai_provider_creation_error"


class AIProviderCleanupError(TracerError):
    """Creation failed and credential cleanup could not be confirmed.

    The context identifies the provider UUID for recovery, never its API key.
    """

    code = "settings.ai_provider_cleanup_error"
