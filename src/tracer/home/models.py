from datetime import date, datetime, timezone
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ApplicationStatus = Literal["applied", "interviewing", "offer", "rejected", "withdrawn"]
EventKind = Literal["interview", "deadline", "other"]
ActivityKind = Literal[
    "card_saved", "card_updated", "task_completed", "application_recorded",
    "application_status_changed", "event_recorded", "event_adjusted",
]


class HomeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    @field_validator("*", mode="after")
    @classmethod
    def utc_times(cls, value):
        if isinstance(value, datetime):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("A timezone is required")
            return value.astimezone(timezone.utc)
        return value


class CreateTaskRequest(HomeModel):
    task_id: UUID
    title: str = Field(strict=True, min_length=1, max_length=200)
    due_on: date | None = None


class Task(CreateTaskRequest):
    created_at: datetime
    completed_at: datetime | None = None


class CreateEventRequest(HomeModel):
    event_id: UUID
    kind: EventKind
    title: str = Field(strict=True, min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime | None = None
    card_key: UUID | None = None
    cancelled: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def ordered_times(self) -> Self:
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError("End must not precede start")
        return self


class ScheduleEvent(CreateEventRequest):
    created_at: datetime


class AdjustEventRequest(HomeModel):
    kind: EventKind | None = None
    title: str | None = Field(default=None, strict=True, min_length=1, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    card_key: UUID | None = None
    cancelled: bool | None = Field(default=None, strict=True)

    @model_validator(mode="after")
    def required_values(self) -> Self:
        for name in ("kind", "title", "starts_at", "cancelled"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError("Required fields cannot be cleared")
        return self


class CreateApplicationRequest(HomeModel):
    application_id: UUID
    card_key: UUID
    applied_on: date
    status: ApplicationStatus = "applied"


class ApplicationRecord(CreateApplicationRequest):
    created_at: datetime
    updated_at: datetime


class ChangeApplicationRequest(HomeModel):
    status: ApplicationStatus


class ApplicationEvent(HomeModel):
    event_id: UUID
    application_id: UUID
    status: ApplicationStatus
    occurred_at: datetime


class ActivityEvent(HomeModel):
    event_id: UUID
    kind: ActivityKind
    occurred_at: datetime
    subject_key: str
    card_key: UUID | None = None
