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


@pytest.mark.parametrize("field_name", ["required_documents", "special_instructions"])
@pytest.mark.parametrize(
    ("new_values", "expected_origins"),
    [
        (["Original item", "Custom item"], ["source", "user_defined"]),
        (
            ["Original item", "Custom item", "New item"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Edited item", "Custom item"], ["user_defined", "user_defined"]),
        (["Custom item"], ["user_defined"]),
        ([], []),
        (["Custom item", "Original item"], ["user_defined", "source"]),
        (["Original item", "Original item"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_application_lists(
    tmp_path, field_name, new_values, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    application = posting_payload["application_instructions"]
    application["source"] = {
        "excerpts": ["Original application instructions."],
        "source_urls": ["https://example.com/jobs/analytics"],
    }
    application["application_url"] = {
        "value": "https://example.com/apply",
        "origin": "source",
    }
    application["required_documents"] = [{"value": "CV", "origin": "source"}]
    application["special_instructions"] = [
        {"value": "Submit PDF files", "origin": "source"}
    ]
    application[field_name] = [
        {"value": "Original item", "origin": "source"},
        {"value": "Custom item", "origin": "user_defined"},
    ]
    posting_payload["role_content"]["responsibilities"] = [
        {"value": "Build reports", "origin": "source"}
    ]
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = make_card_update_request(
        responsibilities=["Build reports"],
        application_url=application["application_url"]["value"],
        required_documents=[
            document["value"] for document in application["required_documents"]
        ],
        special_instructions=[
            instruction["value"] for instruction in application["special_instructions"]
        ],
        posting_alias="My analytics role",
        user_notes="Keep my notes.",
        tags=["priority"],
    )
    update_request[field_name] = new_values

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["application_instructions"][field_name] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving application fields"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request[field_name] = ["Original item", "Custom item"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["application_instructions"][field_name] = (
            application[field_name]
        )
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


@pytest.mark.parametrize("missing_field", ["required_documents", "special_instructions"])
def test_http_requires_application_lists_and_can_add_both(tmp_path, missing_field):
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

        update_request["required_documents"] = ["CV"]
        update_request["special_instructions"] = ["Submit PDF files"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["application_instructions"]["required_documents"] = [
            {"value": "CV", "origin": "user_defined"}
        ]
        expected_payload["posting"]["application_instructions"]["special_instructions"] = [
            {"value": "Submit PDF files", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card
