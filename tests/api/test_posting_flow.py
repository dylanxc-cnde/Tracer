from uuid import uuid4

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
