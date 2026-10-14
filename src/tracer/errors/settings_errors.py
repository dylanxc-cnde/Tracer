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


class AIProviderNotFoundError(TracerError):
    code = "settings.ai_provider_not_found"


class AIProviderInUseError(TracerError):
    code = "settings.ai_provider_in_use"


class UnsupportedAIProviderError(TracerError):
    code = "settings.ai_provider_unsupported"


class AISettingsOperationError(TracerError):
    """A reported failure with no credential change or confirmed compensation."""

    code = "settings.ai_operation_failed"


class AICredentialStateUncertainError(TracerError):
    """A credential operation failed and restoration could not be verified."""

    code = "settings.ai_credential_state_uncertain"


class AISettingsStateUncertainError(TracerError):
    """A settings write failed and the previous snapshot could not be verified."""

    code = "settings.ai_settings_state_uncertain"
