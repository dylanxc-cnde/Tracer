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
        (["Data analytics", "Service design"], ["source", "user_defined"]),
        (
            ["Data analytics", "Service design", "Automation"],
            ["source", "user_defined", "user_defined"],
        ),
        (["Reporting", "Service design"], ["user_defined", "user_defined"]),
        (["Service design"], ["user_defined"]),
        ([], []),
        (["Service design", "Data analytics"], ["user_defined", "source"]),
        (["Data analytics", "Data analytics"], ["source", "source"]),
    ],
)
def test_http_updates_and_restores_role_domains(
    tmp_path, new_values, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["role_content"] = {
        "source": {
            "excerpts": ["Original role description."],
            "source_urls": ["https://example.com/jobs/analytics"],
        },
        "role_summary": {"value": "Original summary", "origin": "source"},
        "responsibilities": [{"value": "Build reports", "origin": "source"}],
        "domains": [
            {"value": "Data analytics", "origin": "source"},
            {"value": "Service design", "origin": "user_defined"},
        ],
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
    )
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = make_card_update_request(
        role_summary="Original summary",
        responsibilities=["Build reports"],
        role_domains=new_values,
        posting_alias="My analytics role",
        user_notes="Keep my notes.",
        tags=["priority"],
    )

    with TestClient(app) as client:
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["domains"] = [
            {"value": value, "origin": origin}
            for value, origin in zip(new_values, expected_origins, strict=True)
        ]
        expected_payload["posting_alias"] = update_request["posting_alias"]
        expected_payload["user_notes"] = update_request["user_notes"]
        expected_payload["tags"] = update_request["tags"]
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]

        update_request["posting_alias"] = "Renamed after saving domains"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = update_request["posting_alias"]
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request["role_domains"] = ["Data analytics", "Service design"]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert restored_response.status_code == 200
        expected_payload["posting"]["role_content"]["domains"] = (
            posting_payload["role_content"]["domains"]
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


def test_http_requires_role_domains_and_can_add_to_empty_list(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    app = create_app(database_path=database_path)
    update_request = make_card_update_request()
    del update_request['role_domains']

    with TestClient(app) as client:
        missing_field_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_field_response.status_code == 422
        assert any(
            error["loc"] == ["body", "role_domains"]
            and error["type"] == "missing"
            for error in missing_field_response.json()["detail"]
        )
        assert store.get_by_card_key(card.card_key) == card

        update_request["role_domains"] = ["Automation"]
        response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert response.status_code == 200
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["role_content"]["domains"] = [
            {"value": "Automation", "origin": "user_defined"}
        ]
        assert response.json() == expected_payload

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card
