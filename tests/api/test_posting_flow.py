from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tracer.api.app import create_app
from tracer.api.models import UpdateCompensationEntryRequest
from tracer.postings import (
    ParsedPosting,
    PostingCard,
    PostingDetails,
    PostingImportRequest,
    PostingParseResult,
)
from tracer.postings.models.posting_parse import PostingParseStatus
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.postings.stores.posting_import_request_store import (
    PostingImportRequestStore,
)


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
            "eligible_groups": None,
            "study_fields": None,
            "student_status_required": None,
            "target_semester": None,
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


def test_http_flow_parses_creates_and_reads_posting_card(tmp_path):
    database_path = tmp_path / "tracer.db"
    parser = FakePostingParser(make_parse_result())
    app = create_app(
        database_path=database_path,
        posting_parser=parser,
    )

    with TestClient(app) as client:
        import_response = client.post(
            "/posting-imports",
            json={
                "kind": "text",
                "text": "Working student posting text.",
                "source_url": None,
            },
        )

        assert import_response.status_code == 201
        import_request = PostingImportRequest.model_validate(
            import_response.json()
        )

        read_import_response = client.get(
            f"/posting-imports/{import_request.import_key}"
        )

        assert read_import_response.status_code == 200
        assert PostingImportRequest.model_validate(
            read_import_response.json()
        ) == import_request

        imports_response = client.get("/posting-imports")

        assert imports_response.status_code == 200
        assert tuple(
            PostingImportRequest.model_validate(item)
            for item in imports_response.json()
        ) == (import_request,)

        parse_response = client.post(
            f"/posting-imports/{import_request.import_key}/parse-results"
        )

        assert parse_response.status_code == 200
        assert PostingParseResult.model_validate(
            parse_response.json()
        ) == parser.result
        assert parser.requests == [import_request]

        parsed_posting = parser.result.postings[0].details
        card_response = client.post(
            "/posting-cards",
            json={
                "import_key": str(import_request.import_key),
                "posting": parsed_posting.model_dump(mode="json"),
                "posting_alias": "Velora Data",
                "user_notes": "Review the working hours.",
                "tags": ["priority"],
            },
        )

        assert card_response.status_code == 201
        card = PostingCard.model_validate(card_response.json())
        assert card.import_key == import_request.import_key
        assert card.posting_alias == "Velora Data"

        read_card_response = client.get(
            f"/posting-cards/{card.card_key}"
        )

        assert read_card_response.status_code == 200
        assert PostingCard.model_validate(
            read_card_response.json()
        ) == card

        cards_response = client.get("/posting-cards")

        assert cards_response.status_code == 200
        assert tuple(
            PostingCard.model_validate(item)
            for item in cards_response.json()
        ) == (card,)

        update_card_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json={
                "role_summary": None,
                "responsibilities": [],
                "role_domains": [],
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
                "contact_name": None,
                "contact_role": None,
                "contact_email": None,
                "contact_phone": None,
                "company_summary": None,
                "industry_tags": [],
                "employee_range": None,
                "posting_alias": "Velora analytics",
                "user_notes": "Prepare questions for the team.",
                "tags": ["priority", "analytics"],
            },
        )

        assert update_card_response.status_code == 200
        updated_card = PostingCard.model_validate(
            update_card_response.json()
        )
        assert updated_card.card_key == card.card_key
        assert updated_card.import_key == card.import_key
        assert updated_card.created_at == card.created_at
        assert updated_card.posting == card.posting
        assert updated_card.posting_alias == "Velora analytics"
        assert updated_card.user_notes == "Prepare questions for the team."
        assert updated_card.tags == ("priority", "analytics")

        stored_card_response = client.get(
            f"/posting-cards/{card.card_key}"
        )

        assert stored_card_response.status_code == 200
        assert PostingCard.model_validate(
            stored_card_response.json()
        ) == updated_card

        original_card_response = client.get(
            f"/posting-cards/{card.card_key}/original"
        )

        assert original_card_response.status_code == 200
        assert PostingCard.model_validate(original_card_response.json()) == card

    stored_import = PostingImportRequestStore(database_path).get(
        import_request.import_key
    )
    assert stored_import == import_request


@pytest.mark.parametrize(
    ("saved_value", "saved_origin", "new_value", "expected_origin"),
    [
        (None, None, None, None),
        (None, None, "User summary", "user_defined"),
        ("Parsed summary", "source", "Parsed summary", "source"),
        ("Parsed summary", "source", "User summary", "user_defined"),
        ("Parsed summary", "source", None, None),
        ("User summary", "user_defined", "User summary", "user_defined"),
    ],
)
def test_http_updates_role_summary_and_preserves_card_context(
    tmp_path, saved_value, saved_origin, new_value, expected_origin
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"] = {
        "source": {
            "excerpts": ["Original role description."],
            "source_urls": ["https://example.com/jobs/analytics"],
        },
        "role_summary": (
            {"value": saved_value, "origin": saved_origin}
            if saved_value is not None
            else None
        ),
        "responsibilities": [
            {"value": "Build reports", "origin": "source"}
        ],
        "domains": [{"value": "Data analytics", "origin": "source"}],
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": new_value,
        "responsibilities": ["Build reports"],
        "role_domains": ["Data analytics"],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My analytics role",
        "user_notes": "Keep these notes.",
        "tags": ["priority"],
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )

        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["role_summary"] = (
            {"value": new_value, "origin": expected_origin}
            if new_value is not None
            else None
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}"
        ).json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"role_summary": ["Not a string"]},
        {"role_summary": {"value": "Cannot supply origin", "origin": "source"}},
        {"responsibilities": None},
        {"responsibilities": "Not a list"},
        {"responsibilities": [42]},
        {"responsibilities": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"role_domains": None},
        {"role_domains": "Not a list"},
        {"role_domains": [42]},
        {"role_domains": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"benefits": None},
        {"benefits": "Not a list"},
        {"benefits": [42]},
        {"benefits": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"vacation_days": -1},
        {"vacation_days": 29.5},
        {"vacation_days": True},
        {"vacation_days": "30"},
        {"vacation_days": "Not a number"},
        {"vacation_days": [30]},
        {"vacation_days": {"value": 30, "origin": "source"}},
        {"required_documents": None},
        {"required_documents": "Not a list"},
        {"required_documents": [42]},
        {"required_documents": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"special_instructions": None},
        {"special_instructions": "Not a list"},
        {"special_instructions": [42]},
        {"special_instructions": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"company_summary": ["Not a string"]},
        {"company_summary": 42},
        {"company_summary": {"value": "Cannot supply origin", "origin": "source"}},
        {"industry_tags": None},
        {"industry_tags": "Not a list"},
        {"industry_tags": [42]},
        {"industry_tags": [{"value": "Cannot supply origin", "origin": "source"}]},
        {"employee_range": ["Not a string"]},
        {"employee_range": 42},
        {"employee_range": {"value": "Cannot supply origin", "origin": "source"}},
        {"posting": {}},
        {"card_key": "Cannot change the card key"},
    ],
)
def test_http_rejects_invalid_card_update_without_changing_storage(
    tmp_path, invalid_fields
):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": "User summary",
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
        **invalid_fields,
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )

    assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


def test_http_repeated_updates_preserve_current_fields_and_original(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)

    with TestClient(app) as client:
        first_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json={
                "role_summary": "User summary",
                "responsibilities": [],
                "role_domains": [],
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
                "contact_name": None,
                "contact_role": None,
                "contact_email": None,
                "contact_phone": None,
                "company_summary": None,
                "industry_tags": [],
                "employee_range": None,
                "posting_alias": "My role",
                "user_notes": "Saved notes",
                "tags": ["priority"],
            },
        )
        second_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json={
                "role_summary": "User summary",
                "responsibilities": [],
                "role_domains": [],
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
                "contact_name": None,
                "contact_role": None,
                "contact_email": None,
                "contact_phone": None,
                "company_summary": None,
                "industry_tags": [],
                "employee_range": None,
                "posting_alias": "My renamed role",
                "user_notes": "Saved notes",
                "tags": ["priority"],
            },
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    expected_payload = first_response.json()
    expected_payload["posting_alias"] = "My renamed role"
    assert second_response.json() == expected_payload
    assert store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("original_value", "original_origin", "intermediate_value"),
    [
        ("Original summary", "source", "User summary"),
        ("Original summary", "source", None),
        ("Original summary", "user_defined", "User summary"),
        (None, None, "User summary"),
    ],
)
def test_http_restores_original_summary_and_origin(
    tmp_path, original_value, original_origin, intermediate_value
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"]["source"] = {
        "excerpts": ["Original role description."],
        "source_urls": ["https://example.com/jobs/analytics"],
    }
    posting_payload["role_content"]["role_summary"] = (
        {"value": original_value, "origin": original_origin}
        if original_value is not None
        else None
    )
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": intermediate_value,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My role",
        "user_notes": "Keep my notes.",
        "tags": ["priority"],
    }

    with TestClient(app) as client:
        first_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )
        assert first_response.status_code == 200
        assert first_response.json()["posting"]["role_content"]["role_summary"] == (
            {"value": intermediate_value, "origin": "user_defined"}
            if intermediate_value is not None
            else None
        )

        update_request["role_summary"] = original_value
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )
        assert restored_response.status_code == 200
        expected_payload = first_response.json()
        expected_payload["posting"]["role_content"]["role_summary"] = (
            posting_payload["role_content"]["role_summary"]
        )
        assert restored_response.json() == expected_payload

        update_request["posting_alias"] = "My renamed role"
        next_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )
        assert next_response.status_code == 200
        expected_payload["posting_alias"] = "My renamed role"
        assert next_response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (
            ["Analyse processes", "Write docs", "Build dashboards"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Automate processes", "Write docs"], ["user_defined", "user_defined"]),
        (["Write docs"], ["user_defined"]),
        ([], []),
        (["Write docs", "Analyse processes"], ["user_defined", "source"]),
        (["Analyse processes", "Analyse processes"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_responsibilities(
    tmp_path, new_values, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"] = {
        "source": {
            "excerpts": ["Original role description."],
            "source_urls": ["https://example.com/jobs/analytics"],
        },
        "role_summary": {"value": "Original summary", "origin": "source"},
        "responsibilities": [
            {"value": "Analyse processes", "origin": "source"},
            {"value": "Write docs", "origin": "user_defined"},
        ],
        "domains": [{"value": "Data analytics", "origin": "source"}],
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": "Original summary",
        "responsibilities": new_values,
        "role_domains": ["Data analytics"],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My analytics role",
        "user_notes": "Keep my notes.",
        "tags": ["priority"],
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["responsibilities"] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}"
        ).json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["responsibilities"] = ["Analyse processes", "Write docs"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )
        assert restored_response.status_code == 200
        expected_payload["posting"]["role_content"]["responsibilities"] = (
            posting_payload["role_content"]["responsibilities"]
        )
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (["Data analytics", "Service design"], ["source", "user_defined"]),
        (
            ["Data analytics", "Service design", "Automation"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Reporting", "Service design"], ["user_defined", "user_defined"]),
        (["Service design"], ["user_defined"]),
        ([], []),
        (["Service design", "Data analytics"], ["user_defined", "source"]),
        (["Data analytics", "Data analytics"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_role_domains(
    tmp_path, new_values, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"] = {
        "source": {
            "excerpts": ["Original role description."],
            "source_urls": ["https://example.com/jobs/analytics"],
        },
        "role_summary": {"value": "Original summary", "origin": "source"},
        "responsibilities": [{"value": "Build reports", "origin": "source"}],
        "domains": [
            {"value": "Data analytics", "origin": "source"},
            {"value": "Service design", "origin": "user_defined"},
        ],
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": "Original summary",
        "responsibilities": ["Build reports"],
        "role_domains": new_values,
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My analytics role",
        "user_notes": "Keep my notes.",
        "tags": ["priority"],
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["domains"] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving domains"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request["role_domains"] = ["Data analytics", "Service design"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert restored_response.status_code == 200
        expected_payload["posting"]["role_content"]["domains"] = (
            posting_payload["role_content"]["domains"]
        )
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_requires_role_domains_and_can_add_to_empty_list(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }

    with TestClient(app) as client:
        missing_field_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_field_response.status_code == 422
        assert any(
            error["loc"] == ["body", "role_domains"]
            and error["type"] == "missing"
            for error in missing_field_response.json()["detail"]
        )
        assert store.get_by_card_key(card.card_key) == card

        update_request["role_domains"] = ["Automation"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["domains"] = [
            {"value": "Automation", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (["Transport pass", "Training budget"], ["source", "user_defined"]),
        (
            ["Transport pass", "Training budget", "Free meals"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Bike leasing", "Training budget"], ["user_defined", "user_defined"]),
        (["Training budget"], ["user_defined"]),
        ([], []),
        (["Training budget", "Transport pass"], ["user_defined", "source"]),
        (["Transport pass", "Transport pass"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_benefits(tmp_path, new_values, expected_origins):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"]["responsibilities"] = [
        {"value": "Build reports", "origin": "source"}
    ]
    posting_payload["compensation"]["source"] = {
        "excerpts": ["We offer a transport pass and a training budget."],
        "source_urls": ["https://example.com/jobs/analytics"],
    }
    posting_payload["compensation"]["benefits"] = [
        {"value": "Transport pass", "origin": "source"},
        {"value": "Training budget", "origin": "user_defined"},
    ]
    posting_payload["compensation"]["entries"] = [
        {
            "origin": "source",
            "compensation_type": "base_salary",
            "minimum_amount": 17,
            "maximum_amount": 20,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_groups": [],
            "payment_conditions": None,
        }
    ]
    posting_payload["compensation"]["vacation_days"] = {
        "value": 30,
        "origin": "source",
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": ["Build reports"],
        "role_domains": [],
        "weekly_hours_minimum": None,
        "weekly_hours_maximum": None,
        "schedule": None,
        "travel_requirement": None,
        "start_on": None,
        "duration": None,
        "compensation_entries": [],
        "benefits": new_values,
        "vacation_days": 30,
        "application_channels": [],
        "application_url": None,
        "application_deadline": None,
        "required_email_subject": None,
        "required_documents": [],
        "special_instructions": [],
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My analytics role",
        "user_notes": "Keep my notes.",
        "tags": ["priority"],
    }
    update_request["compensation_entries"] = [
        entry.model_dump(mode="json", exclude={"origin"})
        for entry in card.posting.compensation.entries
    ]

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["compensation"]["benefits"] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving benefits"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request["benefits"] = ["Transport pass", "Training budget"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert restored_response.status_code == 200
        expected_payload["posting"]["compensation"]["benefits"] = (
            posting_payload["compensation"]["benefits"]
        )
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_requires_benefits_and_can_add_to_empty_list(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
        "weekly_hours_minimum": None,
        "weekly_hours_maximum": None,
        "schedule": None,
        "travel_requirement": None,
        "start_on": None,
        "duration": None,
        "compensation_entries": [],
        "vacation_days": None,
        "application_channels": [],
        "application_url": None,
        "application_deadline": None,
        "required_email_subject": None,
        "required_documents": [],
        "special_instructions": [],
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }

    with TestClient(app) as client:
        missing_field_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_field_response.status_code == 422
        assert store.get_by_card_key(card.card_key) == card

        update_request["benefits"] = ["Training budget"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["compensation"]["benefits"] = [
            {"value": "Training budget", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("original_value", "original_origin", "new_value", "expected_origin"),
    [
        (None, None, None, None),
        (None, None, 30, "user_defined"),
        (30, "source", 30, "source"),
        (30, "source", 35, "user_defined"),
        (30, "source", None, None),
        (30, "source", 0, "user_defined"),
        (0, "source", 30, "user_defined"),
        (30, "user_defined", 30, "user_defined"),
        (30, "user_defined", 31, "user_defined"),
    ],
)
def test_http_updates_and_restores_vacation_days(
    tmp_path, original_value, original_origin, new_value, expected_origin
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["compensation"]["source"] = {
        "excerpts": ["Original compensation description."],
        "source_urls": ["https://example.com/jobs/analytics"],
    }
    posting_payload["compensation"]["benefits"] = [
        {"value": "Transport pass", "origin": "source"}
    ]
    posting_payload["compensation"]["vacation_days"] = (
        {"value": original_value, "origin": original_origin}
        if original_value is not None
        else None
    )
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
        "weekly_hours_minimum": None,
        "weekly_hours_maximum": None,
        "schedule": None,
        "travel_requirement": None,
        "start_on": None,
        "duration": None,
        "compensation_entries": [],
        "benefits": ["Transport pass"],
        "vacation_days": new_value,
        "application_channels": [],
        "application_url": None,
        "application_deadline": None,
        "required_email_subject": None,
        "required_documents": [],
        "special_instructions": [],
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["compensation"]["vacation_days"] = (
            {"value": new_value, "origin": expected_origin}
            if new_value is not None
            else None
        )
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving vacation"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request["vacation_days"] = original_value
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert restored_response.status_code == 200
        expected_payload["posting"]["compensation"]["vacation_days"] = (
            posting_payload["compensation"]["vacation_days"]
        )
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_requires_vacation_days_in_card_update(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}",
            json={
                "role_summary": None,
                "responsibilities": [],
                "role_domains": [],
                "weekly_hours_minimum": None,
                "weekly_hours_maximum": None,
                "schedule": None,
                "travel_requirement": None,
                "start_on": None,
                "duration": None,
                "compensation_entries": [],
                "benefits": [],
                "application_channels": [],
                "application_url": None,
                "application_deadline": None,
                "required_email_subject": None,
                "required_documents": [],
                "special_instructions": [],
                "contact_name": None,
                "contact_role": None,
                "contact_email": None,
                "contact_phone": None,
                "company_summary": None,
                "industry_tags": [],
                "employee_range": None,
                "posting_alias": None,
                "user_notes": None,
                "tags": [],
            },
        )

    assert response.status_code == 422
    assert any(
        error["loc"] == ["body", "vacation_days"]
        and error["type"] == "missing"
        for error in response.json()["detail"]
    )
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["required_documents", "special_instructions"])
@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (["Original item", "Custom item"], ["source", "user_defined"]),
        (
            ["Original item", "Custom item", "New item"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Edited item", "Custom item"], ["user_defined", "user_defined"]),
        (["Custom item"], ["user_defined"]),
        ([], []),
        (["Custom item", "Original item"], ["user_defined", "source"]),
        (["Original item", "Original item"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_application_lists(
    tmp_path, field_name, new_values, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    application = posting_payload["application_instructions"]
    application["source"] = {
        "excerpts": ["Original application instructions."],
        "source_urls": ["https://example.com/jobs/analytics"],
    }
    application["application_url"] = {
        "value": "https://example.com/apply",
        "origin": "source",
    }
    application["required_documents"] = [{"value": "CV", "origin": "source"}]
    application["special_instructions"] = [
        {"value": "Submit PDF files", "origin": "source"}
    ]
    application[field_name] = [
        {"value": "Original item", "origin": "source"},
        {"value": "Custom item", "origin": "user_defined"},
    ]
    posting_payload["role_content"]["responsibilities"] = [
        {"value": "Build reports", "origin": "source"}
    ]
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": ["Build reports"],
        "role_domains": [],
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
        "application_url": application["application_url"]["value"],
        "application_deadline": None,
        "required_email_subject": None,
        "required_documents": [
            document["value"] for document in application["required_documents"]
        ],
        "special_instructions": [
            instruction["value"] for instruction in application["special_instructions"]
        ],
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": "My analytics role",
        "user_notes": "Keep my notes.",
        "tags": ["priority"],
    }
    update_request[field_name] = new_values

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["application_instructions"][field_name] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving application fields"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request[field_name] = ["Original item", "Custom item"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["application_instructions"][field_name] = (
            application[field_name]
        )
        assert restored_response.status_code == 200
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("missing_field", ["required_documents", "special_instructions"])
def test_http_requires_application_lists_and_can_add_both(tmp_path, missing_field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }
    del update_request[missing_field]

    with TestClient(app) as client:
        missing_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_response.status_code == 422
        assert any(
            error["loc"] == ["body", missing_field] and error["type"] == "missing"
            for error in missing_response.json()["detail"]
        )
        assert store.get_by_card_key(card.card_key) == card

        update_request["required_documents"] = ["CV"]
        update_request["special_instructions"] = ["Submit PDF files"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["application_instructions"]["required_documents"] = [
            {"value": "CV", "origin": "user_defined"}
        ]
        expected_payload["posting"]["application_instructions"]["special_instructions"] = [
            {"value": "Submit PDF files", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def make_card_update_request(contact_values=None):
    contact_values = contact_values or {}
    return {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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


@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize(
    ("request_field", "posting_field", "original_value", "new_value", "empty_value"),
    [
        ("application_channels", "channels", ["portal", "email"], ["postal", "other"], []),
        (
            "application_url", "application_url",
            "https://example.com/apply", "https://example.org/new-application", None,
        ),
        ("application_deadline", "application_deadline", "2026-12-01", "2028-02-29", None),
        ("required_email_subject", "required_email_subject", "Job 123", "New subject", None),
    ],
)
def test_http_updates_clears_and_restores_application_facts(
    tmp_path, original_origin, request_field, posting_field,
    original_value, new_value, empty_value,
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    application = posting_payload["application_instructions"]
    application["source"] = {
        "excerpts": ["Original application instructions."],
        "source_urls": ["https://example.com/job", "https://example.com/apply"],
    }
    application[posting_field] = {"value": original_value, "origin": original_origin}
    application["required_documents"] = [{"value": "CV", "origin": "source"}]
    application["special_instructions"] = [{"value": "Use PDF", "origin": "source"}]
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["required_documents"] = ["CV"]
    request["special_instructions"] = ["Use PDF"]
    expected = card.model_dump(mode="json")

    with TestClient(create_app(database_path=database_path)) as client:
        for value, origin in [
            (original_value, original_origin),
            (new_value, "user_defined"),
            (empty_value, None),
            (new_value, "user_defined"),
            (original_value, original_origin),
        ]:
            request[request_field] = value
            response = client.patch(f"/posting-cards/{card.card_key}", json=request)
            expected["posting"]["application_instructions"][posting_field] = (
                None if origin is None else {"value": value, "origin": origin}
            )
            assert response.status_code == 200
            assert response.json() == expected
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected
            assert client.get("/posting-cards").json() == [expected]
            assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
                card.model_dump(mode="json")
            )

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == card
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_adds_application_facts_to_empty_card_and_preserves_saved_changes(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request.update({
        "application_channels": ["portal", "email", "postal", "other"],
        "application_url": "https://example.com/apply",
        "application_deadline": "2020-01-01",  # Past deadlines remain valid facts.
        "required_email_subject": "Application for job 123",
        "role_summary": "My saved summary",
    })
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        saved = response.json()
        application = saved["posting"]["application_instructions"]
        for request_field, posting_field in [
            ("application_channels", "channels"),
            ("application_url", "application_url"),
            ("application_deadline", "application_deadline"),
            ("required_email_subject", "required_email_subject"),
        ]:
            assert application[posting_field] == {
                "value": request[request_field], "origin": "user_defined",
            }
        assert application["source"] == {"excerpts": [], "source_urls": []}

        request["posting_alias"] = "My renamed card"
        request["application_channels"].reverse()
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        saved["posting_alias"] = request["posting_alias"]
        assert response.status_code == 200
        assert response.json() == saved  # Only alias changed; channel order is not an edit.
        assert client.get(f"/posting-cards/{card.card_key}").json() == saved

    assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
        PostingCard.model_validate(saved)
    )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("original_channels", [["email", "portal"], ["email", "portal", "email"]])
def test_http_channel_selection_order_does_not_change_original_provenance(tmp_path, original_channels):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload["application_instructions"]["channels"] = {
        "value": original_channels, "origin": "source",
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    with TestClient(create_app(database_path=database_path)) as client:
        request["application_channels"] = ["portal", "email"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")

        request["application_channels"] = ["other"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        request["application_channels"] = ["portal", "email"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("application_channels", ["email", "email"]),
        ("application_channels", ["unknown"]),
        ("application_channels", "email"),
        ("application_channels", None),
        ("application_channels", [{"value": "email", "origin": "source"}]),
        ("application_url", "javascript:alert(1)"),
        ("application_url", "ftp://example.com/apply"),
        ("application_url", "example.com/apply"),
        ("application_url", "https://"),
        ("application_url", ""),
        ("application_deadline", "2027-13-23"),
        ("application_deadline", "2027-02-29"),
        ("application_deadline", "2028-04-31"),
        ("application_deadline", "2028-02-"),
        ("application_deadline", "0000-01-01"),
        ("required_email_subject", ["Subject"]),
        ("required_email_subject", {"value": "Subject", "origin": "source"}),
    ],
)
def test_http_rejects_invalid_application_fact_updates_without_writing(tmp_path, field, value):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request[field] = value
    request["posting_alias"] = "Must not be saved either"
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(error["loc"][:2] == ["body", field] for error in response.json()["detail"])
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "field",
    ["application_channels", "application_url", "application_deadline", "required_email_subject"],
)
def test_http_requires_application_facts_in_card_update(tmp_path, field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request[field]
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(
            error["loc"] == ["body", field] and error["type"] == "missing"
            for error in response.json()["detail"]
        )
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


def make_compensation_entry(**changes):
    entry = {
        "compensation_type": "base_salary",
        "minimum_amount": 18.5,
        "maximum_amount": 20,
        "currency": "EUR",
        "period": "hour",
        "pay_basis": "gross",
        "applicable_groups": ["Bachelor"],
        "payment_conditions": None,
    }
    entry.update(changes)
    return entry


@pytest.mark.parametrize(
    ("new_entries", "expected_origins"),
    [
        ([make_compensation_entry()], ["source"]),
        ([make_compensation_entry(minimum_amount=19)], ["user_defined"]),
        (
            [
                make_compensation_entry(
                    minimum_amount=22, maximum_amount=25, applicable_groups=["Master"]
                ),
                make_compensation_entry(),
            ],
            ["user_defined", "source"],
        ),
        ([make_compensation_entry(), make_compensation_entry()], ["source", "source"]),
        (
            [
                make_compensation_entry(compensation_type="bonus", period="one_time"),
                make_compensation_entry(compensation_type="bonus", period="year"),
                make_compensation_entry(compensation_type="allowance", currency="Credits"),
                make_compensation_entry(compensation_type="other", pay_basis="net"),
            ],
            ["user_defined"] * 4,
        ),
        (
            [make_compensation_entry(
                minimum_amount=None, maximum_amount=None, currency=None,
                period=None, pay_basis="unknown", applicable_groups=["Student"],
                payment_conditions="After probation",
            )],
            ["user_defined"],
        ),
        ([make_compensation_entry(minimum_amount=0, maximum_amount=0)], ["user_defined"]),
        ([make_compensation_entry(minimum_amount=None)], ["user_defined"]),
        ([make_compensation_entry(maximum_amount=None)], ["user_defined"]),
        ([], []),
    ],
)
def test_http_updates_and_restores_compensation_entries(
    tmp_path, new_entries, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting = make_posting_details().model_dump(mode="json")
    original_entries = [
        {**make_compensation_entry(), "origin": "source"},
        {
            **make_compensation_entry(minimum_amount=22, maximum_amount=25, applicable_groups=["Master"]),
            "origin": "user_defined",
        },
    ]
    posting["compensation"] = {
        "source": {
            "excerpts": ["Hourly pay depends on the degree program."],
            "source_urls": ["https://example.com/jobs/pay"],
        },
        "entries": original_entries,
        "benefits": [{"value": "Training budget", "origin": "source"}],
        "vacation_days": {"value": 30, "origin": "source"},
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["compensation_entries"] = new_entries
    request["benefits"] = ["Training budget"]
    request["vacation_days"] = 30

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        expected = card.model_dump(mode="json")
        expected["posting"]["compensation"]["entries"] = [
            {**entry, "origin": origin}
            for entry, origin in zip(new_entries, expected_origins, strict=True)
        ]
        assert response.json() == expected
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected
        assert store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)

        request["posting_alias"] = "After editing salary"
        expected["posting_alias"] = request["posting_alias"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

        request["compensation_entries"] = [
            entry.model_dump(mode="json", exclude={"origin"})
            for entry in card.posting.compensation.entries
        ]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        expected["posting"]["compensation"]["entries"] = original_entries
        assert response.status_code == 200
        assert response.json() == expected
        assert store.get_original_by_card_key(card.card_key) == card
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == card.model_dump(mode="json")


@pytest.mark.parametrize(
    "invalid_entries",
    [
        None, "Salary", {}, [None], [{}],
        [make_compensation_entry(minimum_amount=-1)],
        [make_compensation_entry(maximum_amount=-1)],
        [make_compensation_entry(minimum_amount=30, maximum_amount=20)],
        [make_compensation_entry(minimum_amount=True)],
        [make_compensation_entry(maximum_amount="20")],
        [make_compensation_entry(compensation_type="salary")],
        [make_compensation_entry(period="day")],
        [make_compensation_entry(pay_basis="taxed")],
        [make_compensation_entry(currency=42)],
        [make_compensation_entry(applicable_groups="Bachelor")],
        [make_compensation_entry(applicable_groups=[1])],
        [make_compensation_entry(payment_conditions=42)],
        [make_compensation_entry(origin="source")],
        [make_compensation_entry(source={"excerpts": [], "source_urls": []})],
        [make_compensation_entry(id="draft-only-id")],
    ],
)
def test_http_rejects_invalid_compensation_without_changing_storage(tmp_path, invalid_entries):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["compensation_entries"] = invalid_entries
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


def test_http_requires_compensation_entries_in_update(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request["compensation_entries"]
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(error["loc"] == ["body", "compensation_entries"] for error in response.json()["detail"])
    assert store.get_by_card_key(card.card_key) == card


@pytest.mark.parametrize("amount", [float("nan"), float("inf"), float("-inf")])
@pytest.mark.parametrize("bound", ["minimum_amount", "maximum_amount"])
def test_compensation_update_rejects_non_finite_amounts(bound, amount):
    with pytest.raises(ValidationError):
        UpdateCompensationEntryRequest.model_validate(make_compensation_entry(**{bound: amount}))


@pytest.mark.parametrize(
    ("field_name", "original_value", "new_value"),
    [
        ("schedule", "Flexible", "Weekdays"),
        ("travel_requirement", "Occasional travel", "No travel"),
        ("start_on", "2026-10-01", "2026-12-15"),
        ("duration", "Six months", "One year"),
    ],
)
@pytest.mark.parametrize("has_original_value", [True, False])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
def test_http_work_condition_text_add_edit_delete_and_restore(
    tmp_path, field_name, original_value, new_value, has_original_value, original_origin
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    conditions = posting_payload["work_conditions"]
    conditions["source"] = {
        "excerpts": ["Original work conditions."],
        "source_urls": ["https://example.com/jobs/conditions"],
    }
    conditions["primary_address"] = {
        "origin": "source", "value": "Example Street 1, Aachen, Germany"
    }
    conditions["address_candidates"] = ["Candidate Street 2, Aachen"]
    conditions["work_modes"] = {"value": ["hybrid"], "origin": "source"}
    conditions[field_name] = (
        {"value": original_value, "origin": original_origin} if has_original_value else None
    )
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    expected_payload = card.model_dump(mode="json")
    changes = [
        (new_value, {"value": new_value, "origin": "user_defined"}),
        (new_value, {"value": new_value, "origin": "user_defined"}),
        (None, None),
        (original_value if has_original_value else None, conditions[field_name]),
    ]
    with TestClient(create_app(database_path=database_path)) as client:
        for value, expected_field in changes:
            update_request[field_name] = value
            response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
            expected_payload["posting"]["work_conditions"][field_name] = expected_field
            assert response.status_code == 200
            assert response.json() == expected_payload
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
            assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
                PostingCard.model_validate(expected_payload)
            )
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("has_original_hours", [True, False])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize(
    ("minimum", "maximum"), [(0, 0), (20, 20), (10.5, 25.5), (None, 20), (15, None)]
)
def test_http_weekly_hours_add_edit_delete_and_restore(
    tmp_path, has_original_hours, original_origin, minimum, maximum
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    conditions = posting_payload["work_conditions"]
    conditions["source"] = {"excerpts": ["Work from 8 to 40 hours per week."], "source_urls": []}
    conditions["weekly_hours"] = (
        {"minimum": 8, "maximum": 40, "origin": original_origin}
        if has_original_hours else None
    )
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    expected_payload = card.model_dump(mode="json")
    with TestClient(create_app(database_path=database_path)) as client:
        for lower, upper, expected_hours in [
            (minimum, maximum, {"minimum": minimum, "maximum": maximum, "origin": "user_defined"}),
            (None, None, None),
            (8 if has_original_hours else None, 40 if has_original_hours else None, conditions["weekly_hours"]),
        ]:
            update_request["weekly_hours_minimum"] = lower
            update_request["weekly_hours_maximum"] = upper
            response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
            expected_payload["posting"]["work_conditions"]["weekly_hours"] = expected_hours
            assert response.status_code == 200
            assert response.json() == expected_payload
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
            assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
                PostingCard.model_validate(expected_payload)
            )
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"weekly_hours_minimum": -1},
        {"weekly_hours_maximum": -1},
        {"weekly_hours_minimum": True},
        {"weekly_hours_maximum": "20"},
        {"weekly_hours_minimum": "not a number"},
        {"weekly_hours_minimum": 40, "weekly_hours_maximum": 20},
        {"schedule": ["Not text"]},
        {"travel_requirement": 42},
        {"start_on": "2026-02-30"},
        {"start_on": "not a date"},
        {"duration": {"value": "Six months", "origin": "source"}},
        {"work_conditions": {"source": {"excerpts": ["Cannot replace sources"]}}},
    ],
)
def test_http_rejects_invalid_work_conditions_without_changing_storage(tmp_path, invalid_fields):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    update_request.update(invalid_fields)
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize("new_value", ["Updated free text", None])
def test_http_updates_and_restores_contact_fields(
    tmp_path, field_name, original_origin, new_value
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    contact = {
        "source": {
            "excerpts": ["Ask Alex from Recruiting for more information."],
            "source_urls": ["https://example.com/contact"],
        },
        "name": "Alex",
        "role": "Recruiting",
        "email": "alex@example.com",
        "phone": "+49 123 456",
        "origin": original_origin,
    }
    posting_payload["contact"] = contact
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request(contact)
    update_request[f"contact_{field_name}"] = new_value

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["contact"][field_name] = new_value
        expected_payload["posting"]["contact"]["origin"] = "user_defined"
        assert response.status_code == 200
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(expected_payload)
        )

        # Saving an unrelated field must keep the edited contact and its source.
        update_request["posting_alias"] = "Renamed card"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = "Renamed card"
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request[f"contact_{field_name}"] = contact[field_name]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["contact"] = contact
        assert restored_response.status_code == 200
        assert restored_response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
def test_http_adds_and_clears_previously_missing_contact(tmp_path, field_name):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request({})
    update_request[f"contact_{field_name}"] = "New contact text"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        expected_contact = {
            "source": {"excerpts": [], "source_urls": []},
            "name": None,
            "role": None,
            "email": None,
            "phone": None,
            "origin": "user_defined",
        }
        expected_contact[field_name] = "New contact text"
        assert response.status_code == 200
        assert response.json()["posting"]["contact"] == expected_contact
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(response.json())
        )

        update_request[f"contact_{field_name}"] = None
        cleared_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert cleared_response.status_code == 200
        assert cleared_response.json() == card.model_dump(mode="json")

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("has_original_values", [True, False])
def test_http_contact_keeps_source_and_restores_origin_only_for_full_match(
    tmp_path, has_original_values
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    contact = {
        "source": {
            "excerpts": ["Original contact information."],
            "source_urls": ["https://example.com/contact"],
        },
        "name": "Alex" if has_original_values else None,
        "role": "Recruiting" if has_original_values else None,
        "email": None,
        "phone": None,
        "origin": "source",
    }
    posting_payload["contact"] = contact
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request(contact)
    update_request["contact_name"] = "Jamie"
    update_request["contact_role"] = "Team lead"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 200
        assert response.json()["posting"]["contact"]["origin"] == "user_defined"

        update_request["contact_name"] = contact["name"]
        partial_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert partial_response.status_code == 200
        assert partial_response.json()["posting"]["contact"]["origin"] == "user_defined"

        cleared_response = client.patch(
            f"/posting-cards/{card.card_key}", json=make_card_update_request({})
        )
        assert cleared_response.status_code == 200
        assert cleared_response.json()["posting"]["contact"] == {
            **contact,
            "name": None,
            "role": None,
            "origin": "user_defined" if has_original_values else "source",
        }

        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=make_card_update_request(contact)
        )
        assert restored_response.status_code == 200
        assert restored_response.json() == card.model_dump(mode="json")

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
@pytest.mark.parametrize("invalid_value", [42, ["Invalid"], {"origin": "source"}])
def test_http_rejects_invalid_contact_without_changing_storage(
    tmp_path, field_name, invalid_value
):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request({})
    update_request[f"contact_{field_name}"] = invalid_value

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 422

        del update_request[f"contact_{field_name}"]
        missing_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_response.status_code == 422

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["company_summary", "employee_range"])
@pytest.mark.parametrize(
    ("original_value", "original_origin", "new_value", "expected_origin"),
    [
        (None, None, None, None),
        (None, None, "Small team, size undisclosed", "user_defined"),
        ("Original text", "source", "Original text", "source"),
        ("Original text", "source", "Updated free text", "user_defined"),
        ("Original text", "source", None, None),
        ("Original text", "user_defined", "Original text", "user_defined"),
        ("Original text", "user_defined", "Updated free text", "user_defined"),
    ],
)
def test_http_updates_and_restores_company_text(
    tmp_path, field_name, original_value, original_origin, new_value, expected_origin
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    company = posting_payload["company"]
    company["source"] = {
        "excerpts": ["Original company description."],
        "source_urls": ["https://example.com/about"],
    }
    company["industry_tags"] = [{"value": "Software", "origin": "source"}]
    company["company_summary"] = {"value": "We build tools.", "origin": "source"}
    company["employee_range"] = {"value": "Around twenty people", "origin": "source"}
    company[field_name] = (
        {"value": original_value, "origin": original_origin}
        if original_value is not None
        else None
    )
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": (
            company["company_summary"]["value"]
            if company["company_summary"] is not None else None
        ),
        "industry_tags": [industry["value"] for industry in company["industry_tags"]],
        "employee_range": (
            company["employee_range"]["value"]
            if company["employee_range"] is not None else None
        ),
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }
    update_request[field_name] = new_value

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["company"][field_name] = (
            {"value": new_value, "origin": expected_origin}
            if new_value is not None else None
        )
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(expected_payload)
        )

        update_request["posting_alias"] = "Renamed after saving company text"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request[field_name] = original_value
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["company"][field_name] = company[field_name]
        assert restored_response.status_code == 200
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("missing_field", ["company_summary", "employee_range"])
def test_http_requires_company_fields_and_can_add_both(tmp_path, missing_field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "industry_tags": [],
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }
    del update_request[missing_field]

    with TestClient(app) as client:
        missing_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_response.status_code == 422
        assert any(
            error["loc"] == ["body", missing_field] and error["type"] == "missing"
            for error in missing_response.json()["detail"]
        )
        assert store.get_by_card_key(card.card_key) == card

        update_request["company_summary"] = "We build tools."
        update_request["employee_range"] = "Small team, size undisclosed"
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        for field_name in ("company_summary", "employee_range"):
            expected_payload["posting"]["company"][field_name] = {
                "value": update_request[field_name], "origin": "user_defined"
            }
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (["Software", "Consulting"], ["source", "user_defined"]),
        (
            ["Software", "Consulting", "Automation"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Engineering", "Consulting"], ["user_defined", "user_defined"]),
        (["Consulting"], ["user_defined"]),
        ([], []),
        (["Consulting", "Software"], ["user_defined", "source"]),
        (["Software", "Software"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_industries(tmp_path, new_values, expected_origins):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    company = posting_payload["company"]
    company["source"] = {
        "excerpts": ["Original company description."],
        "source_urls": ["https://example.com/about"],
    }
    company["company_summary"] = {"value": "We build tools.", "origin": "source"}
    company["employee_range"] = {"value": "Small team", "origin": "source"}
    company["industry_tags"] = [
        {"value": "Software", "origin": "source"},
        {"value": "Consulting", "origin": "user_defined"},
    ]
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": "We build tools.",
        "industry_tags": new_values,
        "employee_range": "Small team",
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["company"]["industry_tags"] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(expected_payload)
        )

        update_request["posting_alias"] = "Renamed after saving industries"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request["industry_tags"] = ["Software", "Consulting"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["company"]["industry_tags"] = company["industry_tags"]
        assert restored_response.status_code == 200
        assert restored_response.json() == expected_payload
        assert client.get(
            f"/posting-cards/{card.card_key}/original"
        ).json() == card.model_dump(mode="json")

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_requires_industries_and_can_add_to_empty_list(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = {
        "role_summary": None,
        "responsibilities": [],
        "role_domains": [],
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
        "contact_name": None,
        "contact_role": None,
        "contact_email": None,
        "contact_phone": None,
        "company_summary": None,
        "employee_range": None,
        "posting_alias": None,
        "user_notes": None,
        "tags": [],
    }

    with TestClient(app) as client:
        missing_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_response.status_code == 422
        assert any(
            error["loc"] == ["body", "industry_tags"] and error["type"] == "missing"
            for error in missing_response.json()["detail"]
        )
        assert store.get_by_card_key(card.card_key) == card

        update_request["industry_tags"] = ["Software"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["company"]["industry_tags"] = [
            {"value": "Software", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_missing_import_and_card_return_not_found(tmp_path):
    missing_key = uuid4()
    app = create_app(
        database_path=tmp_path / "tracer.db",
        posting_parser=FakePostingParser(make_parse_result()),
    )

    with TestClient(app) as client:
        import_response = client.get(f"/posting-imports/{missing_key}")
        parse_response = client.post(
            f"/posting-imports/{missing_key}/parse-results"
        )
        delete_import_response = client.delete(
            f"/posting-imports/{missing_key}"
        )
        card_response = client.get(f"/posting-cards/{missing_key}")
        original_card_response = client.get(
            f"/posting-cards/{missing_key}/original"
        )
        update_card_response = client.patch(
            f"/posting-cards/{missing_key}",
            json={
                "role_summary": None,
                "responsibilities": [],
                "role_domains": [],
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
                "contact_name": None,
                "contact_role": None,
                "contact_email": None,
                "contact_phone": None,
                "company_summary": None,
                "industry_tags": [],
                "employee_range": None,
                "posting_alias": None,
                "user_notes": None,
                "tags": [],
            },
        )

    assert import_response.status_code == 404
    assert import_response.json() == {"detail": "Posting import not found"}
    assert parse_response.status_code == 404
    assert delete_import_response.status_code == 404
    assert delete_import_response.json() == {
        "detail": "Posting import not found"
    }
    assert card_response.status_code == 404
    assert card_response.json() == {"detail": "Posting card not found"}
    assert original_card_response.status_code == 404
    assert original_card_response.json() == {"detail": "Posting card not found"}
    assert update_card_response.status_code == 404
    assert update_card_response.json() == {
        "detail": "Posting card not found"
    }


def test_http_rejects_invalid_original_card_key(tmp_path):
    app = create_app(database_path=tmp_path / "tracer.db")

    with TestClient(app) as client:
        response = client.get("/posting-cards/not-a-uuid/original")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["path", "card_key"]


def test_http_deletes_posting_card(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(
        import_key=uuid4(),
        posting=make_posting_details(),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)

    with TestClient(app) as client:
        delete_response = client.delete(
            f"/posting-cards/{card.card_key}"
        )
        read_response = client.get(
            f"/posting-cards/{card.card_key}"
        )
        original_response = client.get(
            f"/posting-cards/{card.card_key}/original"
        )

    assert delete_response.status_code == 204
    assert delete_response.content == b""
    assert read_response.status_code == 404
    assert original_response.status_code == 404
    assert store.get_by_card_key(card.card_key) is None


def test_http_returns_not_found_when_deleting_missing_card(tmp_path):
    missing_key = uuid4()
    app = create_app(database_path=tmp_path / "tracer.db")

    with TestClient(app) as client:
        response = client.delete(f"/posting-cards/{missing_key}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Posting card not found"}


def test_http_deletes_import_without_deleting_posting_card(tmp_path):
    database_path = tmp_path / "tracer.db"
    import_request = PostingImportRequest(
        import_key=uuid4(),
        source={
            "kind": "text",
            "text": "Working student posting text.",
            "source_url": None,
        },
    )
    card = PostingCard(
        import_key=import_request.import_key,
        posting=make_posting_details(),
    )
    PostingImportRequestStore(database_path).add(import_request)
    PostingCardStore(database_path).add(card)
    app = create_app(database_path=database_path)

    with TestClient(app) as client:
        delete_response = client.delete(
            f"/posting-imports/{import_request.import_key}"
        )
        read_import_response = client.get(
            f"/posting-imports/{import_request.import_key}"
        )
        read_card_response = client.get(
            f"/posting-cards/{card.card_key}"
        )
        original_card_response = client.get(
            f"/posting-cards/{card.card_key}/original"
        )

    assert delete_response.status_code == 204
    assert delete_response.content == b""
    assert read_import_response.status_code == 404
    assert read_card_response.status_code == 200
    assert PostingCard.model_validate(read_card_response.json()) == card
    assert original_card_response.status_code == 200
    assert PostingCard.model_validate(original_card_response.json()) == card
