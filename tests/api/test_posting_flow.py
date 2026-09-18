from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
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
            "source": empty_source,
            "locations": [],
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
                "benefits": [],
                "vacation_days": None,
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
        "benefits": [],
        "vacation_days": None,
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
        "benefits": [],
        "vacation_days": None,
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
                "benefits": [],
                "vacation_days": None,
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
                "benefits": [],
                "vacation_days": None,
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
        "benefits": [],
        "vacation_days": None,
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
        "benefits": [],
        "vacation_days": None,
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
        "benefits": new_values,
        "vacation_days": 30,
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
        "vacation_days": None,
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
        "benefits": ["Transport pass"],
        "vacation_days": new_value,
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
                "benefits": [],
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
                "benefits": [],
                "vacation_days": None,
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
