from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .posting_details_models import PostingDetails


class _PostingCardModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )


def _utc_now() -> datetime:
    return datetime.now(UTC)


class PostingCard(_PostingCardModel):
    """One user-confirmed posting stored by Tracer."""

    posting_key: UUID = Field(default_factory=uuid4)
    import_key: UUID
    schema_version: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=_utc_now)
    posting_details: PostingDetails
    posting_alias: str | None = None
    user_notes: str | None = None
    tags: tuple[str, ...] = ()

    @field_validator("created_at", mode="after")
    @classmethod
    def require_created_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone is required for created_at")
        return value.astimezone(UTC)
