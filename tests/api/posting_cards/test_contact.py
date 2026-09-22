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


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize("new_value", ["Updated free text", None])
def test_http_updates_and_restores_contact_fields(
    tmp_path, field_name, original_origin, new_value
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    contact = {
        "source": {
            "excerpts": ["Ask Alex from Recruiting for more information."],
            "source_urls": ["https://example.com/contact"],
        },
        "name": "Alex",
        "role": "Recruiting",
        "email": "alex@example.com",
        "phone": "+49 123 456",
        "origin": original_origin,
    }
    posting_payload["contact"] = contact
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request(contact)
    update_request[f"contact_{field_name}"] = new_value

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        expected_payload = card.model_dump(mode="json")
        expected_payload["posting"]["contact"][field_name] = new_value
        expected_payload["posting"]["contact"]["origin"] = "user_defined"
        assert response.status_code == 200
        assert response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
        assert client.get("/posting-cards").json() == [expected_payload]
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(expected_payload)
        )

        # Saving an unrelated field must keep the edited contact and its source.
        update_request["posting_alias"] = "Renamed card"
        repeated_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting_alias"] = "Renamed card"
        assert repeated_response.status_code == 200
        assert repeated_response.json() == expected_payload

        update_request[f"contact_{field_name}"] = contact[field_name]
        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        expected_payload["posting"]["contact"] = contact
        assert restored_response.status_code == 200
        assert restored_response.json() == expected_payload
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key) == (
        PostingCard.model_validate(expected_payload)
    )
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
def test_http_adds_and_clears_previously_missing_contact(tmp_path, field_name):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request({})
    update_request[f"contact_{field_name}"] = "New contact text"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        expected_contact = {
            "source": {"excerpts": [], "source_urls": []},
            "name": None,
            "role": None,
            "email": None,
            "phone": None,
            "origin": "user_defined",
        }
        expected_contact[field_name] = "New contact text"
        assert response.status_code == 200
        assert response.json()["posting"]["contact"] == expected_contact
        assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
            PostingCard.model_validate(response.json())
        )

        update_request[f"contact_{field_name}"] = None
        cleared_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert cleared_response.status_code == 200
        assert cleared_response.json() == card.model_dump(mode="json")

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("has_original_values", [True, False])
def test_http_contact_keeps_source_and_restores_origin_only_for_full_match(
    tmp_path, has_original_values
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    contact = {
        "source": {
            "excerpts": ["Original contact information."],
            "source_urls": ["https://example.com/contact"],
        },
        "name": "Alex" if has_original_values else None,
        "role": "Recruiting" if has_original_values else None,
        "email": None,
        "phone": None,
        "origin": "source",
    }
    posting_payload["contact"] = contact
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request(contact)
    update_request["contact_name"] = "Jamie"
    update_request["contact_role"] = "Team lead"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 200
        assert response.json()["posting"]["contact"]["origin"] == "user_defined"

        update_request["contact_name"] = contact["name"]
        partial_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert partial_response.status_code == 200
        assert partial_response.json()["posting"]["contact"]["origin"] == "user_defined"

        cleared_response = client.patch(
            f"/posting-cards/{card.card_key}", json=make_card_update_request({})
        )
        assert cleared_response.status_code == 200
        assert cleared_response.json()["posting"]["contact"] == {
            **contact,
            "name": None,
            "role": None,
            "origin": "user_defined" if has_original_values else "source",
        }

        restored_response = client.patch(
            f"/posting-cards/{card.card_key}", json=make_card_update_request(contact)
        )
        assert restored_response.status_code == 200
        assert restored_response.json() == card.model_dump(mode="json")

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field_name", ["name", "role", "email", "phone"])
@pytest.mark.parametrize("invalid_value", [42, ["Invalid"], {"origin": "source"}])
def test_http_rejects_invalid_contact_without_changing_storage(
    tmp_path, field_name, invalid_value
):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request({})
    update_request[f"contact_{field_name}"] = invalid_value

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 422

        del update_request[f"contact_{field_name}"]
        missing_response = client.patch(
            f"/posting-cards/{card.card_key}", json=update_request
        )
        assert missing_response.status_code == 422

    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
