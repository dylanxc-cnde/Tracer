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
    """User-owned posting card fields replaced by one update."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    posting_alias: str | None
    user_notes: str | None
    tags: tuple[str, ...]
