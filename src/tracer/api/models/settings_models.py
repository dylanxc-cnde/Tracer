from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from tracer.settings.models import AIProvider


class UpdateUserSettingsRequest(BaseModel):
    """Editable User settings submitted together; null clears the display name."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    display_name: str | None = Field(..., strict=True)


class CreateAIProviderRequest(BaseModel):
    """Create one provider configuration; its UUID is assigned by the service.

    The secret is write-only input, not part of the saved settings snapshot.
    The HTTP layer returns sanitized validation errors for this secret-bearing input.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    provider: AIProvider
    display_name: str = Field(strict=True, min_length=1)
    monthly_budget_usd: float | None = Field(
        default=None, ge=0, strict=True, allow_inf_nan=False
    )
    api_key: SecretStr = Field(strict=True, repr=False)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("display_name must not be blank")
        return value

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: SecretStr) -> SecretStr:
        """Reject blank keys without changing the contents of a nonblank key."""
        if not value.get_secret_value().strip():
            raise ValueError("api_key must not be blank")
        return value


class UpdateAIProviderRequest(BaseModel):
    """Replace only the editable public fields, never identity or credentials."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    display_name: str = Field(strict=True, min_length=1)
    monthly_budget_usd: float | None = Field(
        ..., ge=0, strict=True, allow_inf_nan=False
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("display_name must not be blank")
        return value


class ReplaceAIProviderKeyRequest(BaseModel):
    """Write-only replacement; nonblank secrets are passed through unchanged."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    api_key: SecretStr = Field(strict=True, repr=False)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("api_key must not be blank")
        return value


class UpdateAITaskRequest(BaseModel):
    """Selection for the supported posting parser, not an arbitrary new task."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    provider_key: UUID
    model: str = Field(strict=True, min_length=1)

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("model must not be blank")
        return value
