from datetime import date
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from tracer.postings import PostingDetails


class CreatePostingCardRequest(BaseModel):
    """User-confirmed data used to create one posting card."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    import_key: UUID
    posting: PostingDetails
    posting_alias: str | None = None
    user_notes: str | None = None
    tags: tuple[str, ...] = ()


class UpdatePostingCardRequest(BaseModel):
    """Editable posting card content submitted in one update."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    role_summary: str | None
    responsibilities: tuple[str, ...]
    role_domains: tuple[str, ...]
    weekly_hours_minimum: float | None = Field(
        ..., ge=0, strict=True, allow_inf_nan=False
    )
    weekly_hours_maximum: float | None = Field(
        ..., ge=0, strict=True, allow_inf_nan=False
    )
    schedule: str | None
    travel_requirement: str | None
    start_on: date | None
    duration: str | None
    benefits: tuple[str, ...]
    vacation_days: int | None = Field(..., ge=0, strict=True)
    required_documents: tuple[str, ...]
    special_instructions: tuple[str, ...]
    contact_name: str | None
    contact_role: str | None
    contact_email: str | None
    contact_phone: str | None
    company_summary: str | None
    industry_tags: tuple[str, ...]
    employee_range: str | None
    posting_alias: str | None
    user_notes: str | None
    tags: tuple[str, ...]

    @model_validator(mode="after")
    def validate_weekly_hours_range(self) -> Self:
        """Keep user-entered weekly hours in ascending order."""
        if (
            self.weekly_hours_minimum is not None
            and self.weekly_hours_maximum is not None
            and self.weekly_hours_minimum > self.weekly_hours_maximum
        ):
            raise ValueError("Weekly hours minimum must not exceed maximum")
        return self
