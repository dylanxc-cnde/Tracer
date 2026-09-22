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
    update_request = make_card_update_request(
        benefits=["Transport pass"],
        vacation_days=new_value,
    )

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

    update_request = make_card_update_request()
    del update_request["vacation_days"]

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}",
            json=update_request,
        )

    assert response.status_code == 422
    assert any(
        error["loc"] == ["body", "vacation_days"]
        and error["type"] == "missing"
        for error in response.json()["detail"]
    )
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
