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
    update_request = make_card_update_request(
        company_summary=company["company_summary"]["value"]
            if company["company_summary"] is not None else None,
        industry_tags=[industry["value"] for industry in company["industry_tags"]],
        employee_range=company["employee_range"]["value"]
            if company["employee_range"] is not None else None,
    )
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
    update_request = make_card_update_request()
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
