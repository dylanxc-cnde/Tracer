from pydantic import BaseModel, ConfigDict, Field


class UpdateUserSettingsRequest(BaseModel):
    """Editable User settings submitted together; null clears the display name."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    display_name: str | None = Field(..., strict=True)
