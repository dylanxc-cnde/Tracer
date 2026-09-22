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
    update_request = make_card_update_request(
        company_summary="We build tools.",
        industry_tags=new_values,
        employee_range="Small team",
    )

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
    update_request = make_card_update_request()
    del update_request['industry_tags']

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
