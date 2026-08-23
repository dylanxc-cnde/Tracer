from uuid import UUID

from tracer.postings.models.posting_details import PostingDetails
from tracer.postings.services.create_posting_card import (
    CreatePostingCardService,
)
from tracer.postings.stores.posting_card_store import PostingCardStore


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")


def make_posting_details() -> PostingDetails:
    return PostingDetails(
        identity={
            "company_name": {
                "value": "Velora Grid Systems SE",
                "origin": "source",
                "sources": [],
            },
            "department_name": None,
            "position_title": {
                "value": "Working Student Data Analytics",
                "origin": "source",
                "sources": [],
            },
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


def test_service_creates_and_stores_confirmed_card(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    service = CreatePostingCardService(store)
    posting = make_posting_details()

    card = service.create(
        import_key=IMPORT_KEY,
        posting=posting,
        posting_alias="Velora Data",
        user_notes="Review the working hours.",
        tags=("priority", "analytics"),
    )

    assert card.import_key == IMPORT_KEY
    assert card.posting == posting
    assert card.posting_alias == "Velora Data"
    assert card.user_notes == "Review the working hours."
    assert card.tags == ("priority", "analytics")
    assert store.get_by_card_key(card.card_key) == card
