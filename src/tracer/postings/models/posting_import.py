from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


class _PostingImportModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )


def _utc_now() -> datetime:
    return datetime.now(UTC)


class UrlImport(_PostingImportModel):
    """A public job-posting URL submitted for AI retrieval."""

    kind: Literal["url"] = "url"
    url: AnyHttpUrl


class TextImport(_PostingImportModel):
    """Job-posting text pasted by the user."""

    kind: Literal["text"] = "text"
    text: str
    source_url: AnyHttpUrl | None = None

    @field_validator("text", mode="after")
    @classmethod
    def require_non_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must contain non-whitespace characters")
        return value


PostingImportSource = Annotated[
    UrlImport | TextImport,
    Field(discriminator="kind"),
]


class PostingImportRequest(_PostingImportModel):
    """One request to parse posting details from a URL or pasted text."""

    import_key: UUID
    schema_version: int = Field(default=1, ge=1)
    submitted_at: datetime = Field(default_factory=_utc_now)
    source: PostingImportSource

    @field_validator("submitted_at", mode="after")
    @classmethod
    def require_submission_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone is required for submitted_at")
        return value.astimezone(UTC)
