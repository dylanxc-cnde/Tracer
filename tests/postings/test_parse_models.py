import pytest
from pydantic import ValidationError

from tracer.postings.parse_models import (
    PostingParseResult,
    PostingParseStatus,
    PostingRefinementReason,
)
from tracer.postings.posting_details_models import PostingDetails


def make_posting_details() -> PostingDetails:
    return PostingDetails(
        identity={},
        company={},
        classification={},
        work_conditions={},
        role_content={},
        requirements={},
        compensation={},
        application_instructions={},
        contact={},
    )


def test_posting_parse_result_keeps_over_limit_result_structured():
    posting = make_posting_details()
    result = PostingParseResult(
        status="refinement_required",
        postings=[posting] * 6,
        refinement_reason="too_many_postings",
        refinement_suggestions=["München", "Wärmepumpe"],
    )

    assert result.status is PostingParseStatus.REFINEMENT_REQUIRED
    assert (
        result.refinement_reason
        is PostingRefinementReason.TOO_MANY_POSTINGS
    )
    assert len(result.postings) == 6
    postings_schema = PostingParseResult.model_json_schema()["properties"][
        "postings"
    ]
    assert "maxItems" not in postings_schema


def test_posting_parse_result_does_not_duplicate_too_many_status():
    with pytest.raises(ValidationError, match="has_more"):
        PostingParseResult(
            status="refinement_required",
            refinement_reason="too_many_postings",
            has_more=True,
        )
