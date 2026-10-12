from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from tracer.settings.models import AIProvider


class UpdateUserSettingsRequest(BaseModel):
    """Editable User settings submitted together; null clears the display name."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    display_name: str | None = Field(..., strict=True)


class CreateAIProviderRequest(BaseModel):
    """Create one provider configuration; its UUID is assigned by the service.

    The secret is write-only input, not part of the saved settings snapshot.
    HTTP validation errors still need sanitizing before this model is exposed.
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
