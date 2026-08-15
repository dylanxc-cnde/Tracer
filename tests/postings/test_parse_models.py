import pytest
from pydantic import ValidationError

from tracer.postings.parse_models import (
    ParsedPosting,
    PostingParseAmbiguity,
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
        requirements=[],
        compensation={},
        application_instructions={},
        contact=None,
    )


def make_parsed_posting() -> ParsedPosting:
    return ParsedPosting(
        details=make_posting_details(),
        parse_ambiguities=[
            PostingParseAmbiguity(
                field_path="compensation.entries",
                description="The page states two monthly maxima.",
                alternatives=["6000 EUR/month", "5000 EUR/month plus bonus"],
            )
        ],
    )


def test_parsed_posting_keeps_ambiguities_outside_details():
    posting = make_parsed_posting()

    assert len(posting.parse_ambiguities) == 1
    assert posting.parse_ambiguities[0].field_path == "compensation.entries"
    assert "parse_ambiguities" not in PostingDetails.model_fields


def test_posting_parse_result_keeps_over_limit_result_structured():
    posting = make_parsed_posting()
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
