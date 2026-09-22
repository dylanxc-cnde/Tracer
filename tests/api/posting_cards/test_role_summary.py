from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard, PostingDetails
from tracer.postings.stores.posting_card_store import PostingCardStore

from tests.api.factories import (
    make_card_update_request,
    make_posting_details,
)


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
    update_request = make_card_update_request(
        role_summary=new_value,
        responsibilities=["Build reports"],
        role_domains=["Data analytics"],
        posting_alias="My analytics role",
        user_notes="Keep these notes.",
        tags=["priority"],
    )

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
    update_request = make_card_update_request(
        role_summary=intermediate_value,
        posting_alias="My role",
        user_notes="Keep my notes.",
        tags=["priority"],
    )

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
