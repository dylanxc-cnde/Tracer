from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard, PostingImportRequest, PostingParseResult
from tracer.postings.stores.posting_import_request_store import PostingImportRequestStore

from tests.api.factories import (
    FakePostingParser,
    make_card_update_request,
    make_parse_result,
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
            json=make_card_update_request(
                posting_alias="Velora analytics",
                user_notes="Prepare questions for the team.",
                tags=["priority", "analytics"],
            ),
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
