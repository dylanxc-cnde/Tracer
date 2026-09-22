from uuid import uuid4

from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard, PostingImportRequest
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.postings.stores.posting_import_request_store import PostingImportRequestStore

from tests.api.factories import (
    FakePostingParser,
    make_card_update_request,
    make_parse_result,
    make_posting_details,
)


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
            json=make_card_update_request(),
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
