from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard
from tracer.postings.stores.posting_card_store import PostingCardStore

from tests.api.factories import (
    make_card_update_request,
    make_posting_details,
)


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
    update_request = make_card_update_request(
        role_summary="User summary",
    )
    update_request.update(invalid_fields)

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
            json=make_card_update_request(
                role_summary="User summary",
                posting_alias="My role",
                user_notes="Saved notes",
                tags=["priority"],
            ),
        )
        second_response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=make_card_update_request(
                role_summary="User summary",
                posting_alias="My renamed role",
                user_notes="Saved notes",
                tags=["priority"],
            ),
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
