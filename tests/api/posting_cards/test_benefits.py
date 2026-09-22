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
    update_request = make_card_update_request(
        responsibilities=["Build reports"],
        benefits=new_values,
        vacation_days=30,
        posting_alias="My analytics role",
        user_notes="Keep my notes.",
        tags=["priority"],
    )
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
    update_request = make_card_update_request()
    del update_request['benefits']

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
