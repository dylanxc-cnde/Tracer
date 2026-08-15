from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from .posting_details_models import PostingDetails


class _PostingParseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )


class PostingParseStatus(StrEnum):
    COMPLETE = "complete"
    REFINEMENT_REQUIRED = "refinement_required"
    NOT_FOUND = "not_found"


class PostingRefinementReason(StrEnum):
    TOO_MANY_POSTINGS = "too_many_postings"
    AMBIGUOUS_TARGET = "ambiguous_target"
    INSUFFICIENT_DETAIL = "insufficient_detail"


class PostingParseResult(_PostingParseModel):
    """Result of one model parsing call."""

    status: PostingParseStatus
    postings: tuple[PostingDetails, ...] = ()
    refinement_reason: PostingRefinementReason | None = None
    refinement_suggestions: tuple[str, ...] = ()
