from datetime import date
from typing import Self
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

from tracer.postings import PostingDetails
from tracer.postings.models.posting_details import (
    ApplicationChannel,
    CompensationPeriod,
    CompensationType,
    PayBasis,
)


class CreatePostingCardRequest(BaseModel):
    """User-confirmed data used to create one posting card."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    import_key: UUID
    posting: PostingDetails
    posting_alias: str | None = None
    user_notes: str | None = None
    tags: tuple[str, ...] = ()


class UpdateCompensationEntryRequest(BaseModel):
    """Editable values for one compensation entry, without source metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    compensation_type: CompensationType
    minimum_amount: float | None = Field(
        ..., ge=0, strict=True, allow_inf_nan=False
    )
    maximum_amount: float | None = Field(
        ..., ge=0, strict=True, allow_inf_nan=False
    )
    currency: str | None
    period: CompensationPeriod | None
    pay_basis: PayBasis
    applicable_groups: tuple[str, ...]
    payment_conditions: str | None

    @model_validator(mode="after")
    def validate_amount_range(self) -> Self:
        """Keep user-entered compensation bounds in ascending order."""
        if (
            self.minimum_amount is not None
            and self.maximum_amount is not None
            and self.minimum_amount > self.maximum_amount
        ):
            raise ValueError("Minimum compensation must not exceed maximum")
        return self


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
    compensation_entries: tuple[UpdateCompensationEntryRequest, ...]
    benefits: tuple[str, ...]
    vacation_days: int | None = Field(..., ge=0, strict=True)
    application_channels: tuple[ApplicationChannel, ...]
    application_url: AnyHttpUrl | None
    application_deadline: date | None
    required_email_subject: str | None
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

    @field_validator("application_channels")
    @classmethod
    def validate_application_channels(
        cls, channels: tuple[ApplicationChannel, ...]
    ) -> tuple[ApplicationChannel, ...]:
        """Each application channel can be selected at most once."""
        if len(set(channels)) != len(channels):
            raise ValueError("Application channels must be unique")
        return channels

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
