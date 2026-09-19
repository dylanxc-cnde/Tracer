from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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
