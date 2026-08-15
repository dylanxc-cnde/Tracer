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
        identity={
            "company_name": None,
            "department_name": None,
            "position_title": None,
            "external_job_id": None,
            "canonical_posting_url": None,
            "source_platform": None,
            "published_on": None,
            "posting_language": None,
        },
        company={
            "industry_tags": [],
            "employee_range": None,
            "company_summary": None,
        },
        classification={
            "role_families": None,
            "original_employment_type": None,
            "contract_type": None,
            "seniority": None,
            "internship_requirement": None,
            "eligible_groups": None,
            "study_fields": None,
            "student_status_required": None,
            "target_semester": None,
        },
        work_conditions={
            "locations": [],
            "work_modes": None,
            "weekly_hours": None,
            "schedule": None,
            "travel_requirement": None,
            "start_on": None,
            "duration": None,
        },
        role_content={
            "role_summary": None,
            "responsibilities": [],
            "domains": [],
        },
        requirements=[],
        compensation={
            "entries": [],
            "benefits": [],
            "vacation_days": None,
        },
        application_instructions={
            "channels": None,
            "application_url": None,
            "required_email_subject": None,
            "required_documents": [],
            "special_instructions": [],
            "application_deadline": None,
        },
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
                sources=[],
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
            postings=[],
            refinement_reason="too_many_postings",
            refinement_suggestions=[],
            has_more=True,
        )


def test_posting_parse_schema_requires_every_defined_field():
    schema = PostingParseResult.model_json_schema()

    def check(value):
        if isinstance(value, dict):
            properties = value.get("properties")
            if properties is not None:
                assert set(value["required"]) == set(properties)
            assert "default" not in value
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(schema)
