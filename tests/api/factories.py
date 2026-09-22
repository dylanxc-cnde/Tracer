"""Shared API test data; never derive expected results from production update code."""

from tracer.postings import (
    ParsedPosting,
    PostingDetails,
    PostingImportRequest,
    PostingParseResult,
)
from tracer.postings.models.posting_parse import PostingParseStatus


class FakePostingParser:
    """Return a fixed parse result without calling an external API."""

    def __init__(self, result: PostingParseResult):
        self.result = result
        self.requests: list[PostingImportRequest] = []

    def parse(
        self,
        request: PostingImportRequest,
    ) -> PostingParseResult:
        self.requests.append(request)
        return self.result


def make_posting_details() -> PostingDetails:
    empty_source = {"excerpts": [], "source_urls": []}

    return PostingDetails(
        identity={
            "source": empty_source,
            "company_name": {
                "value": "Velora Grid Systems SE",
                "origin": "source",
            },
            "department_name": None,
            "position_title": {
                "value": "Working Student Data Analytics",
                "origin": "source",
            },
            "external_job_id": None,
            "canonical_posting_url": None,
            "source_platform": None,
            "published_on": None,
            "posting_language": None,
        },
        company={
            "source": empty_source,
            "industry_tags": [],
            "employee_range": None,
            "company_summary": None,
        },
        classification={
            "source": empty_source,
            "role_families": None,
            "workload_type": None,
            "contract_type": None,
            "seniority": None,
            "internship_requirement": None,
            "eligibility": None,
        },
        work_conditions={
            "source": empty_source,
            "primary_address": None,
            "address_candidates": [],
            "work_modes": None,
            "weekly_hours": None,
            "schedule": None,
            "travel_requirement": None,
            "start_on": None,
            "duration": None,
        },
        role_content={
            "source": empty_source,
            "role_summary": None,
            "responsibilities": [],
            "domains": [],
        },
        requirements={"source": empty_source, "groups": []},
        compensation={
            "source": empty_source,
            "entries": [],
            "benefits": [],
            "vacation_days": None,
        },
        application_instructions={
            "source": empty_source,
            "channels": None,
            "application_url": None,
            "required_email_subject": None,
            "required_documents": [],
            "special_instructions": [],
            "application_deadline": None,
        },
        contact=None,
    )


def make_parse_result() -> PostingParseResult:
    return PostingParseResult(
        status=PostingParseStatus.COMPLETE,
        postings=(
            ParsedPosting(
                details=make_posting_details(),
                parse_ambiguities=(),
            ),
        ),
        refinement_reason=None,
        refinement_suggestions=(),
    )


def make_card_update_request(contact_values=None, **changes):
    """Build a fresh full update body; each test overrides only its own fields."""
    contact_values = contact_values or {}
    request = {
        "canonical_posting_url": None,
        "source_platform": None,
        "published_on": None,
        "posting_language": None,
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
        "requirement_groups": [],
        "workload_type": None,
        "role_families": [],
        "contract_type": None,
        "seniority": None,
        "work_modes": [],
        "primary_address": None,
        "address_candidates": [],
        "internship_requirement": None,
        "eligibility": None,
        "weekly_hours_minimum": None,
        "weekly_hours_maximum": None,
        "schedule": None,
        "travel_requirement": None,
        "start_on": None,
        "duration": None,
        "compensation_entries": [],
        "benefits": [],
        "vacation_days": None,
        "application_channels": [],
        "application_url": None,
        "application_deadline": None,
        "required_email_subject": None,
        "required_documents": [],
        "special_instructions": [],
        "contact_name": contact_values.get("name"),
        "contact_role": contact_values.get("role"),
        "contact_email": contact_values.get("email"),
        "contact_phone": contact_values.get("phone"),
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }
    request.update(changes)
    return request
