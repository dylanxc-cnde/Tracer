from uuid import UUID

from pydantic import BaseModel, ConfigDict

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
    posting_alias: str | None
    user_notes: str | None
    tags: tuple[str, ...]
