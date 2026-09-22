import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard, PostingDetails
from tracer.postings.stores.posting_card_store import PostingCardStore

from tests.api.factories import make_card_update_request, make_posting_details


IDENTITY_FIELDS = [
    "position_title", "company_name", "department_name", "external_job_id",
]


@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize(
    ("field", "original_value", "new_value"),
    [
        ("position_title", "Working Student Data Analytics", "Software Engineer"),
        ("company_name", "Velora Grid Systems SE", "Updated Company GmbH"),
        ("department_name", "Analytics", "Engineering"),
        ("external_job_id", "DE-0017", "000042"),
    ],
)
def test_http_updates_clears_and_restores_identity(
    tmp_path, original_origin, field, original_value, new_value,
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["identity"]["source"] = {
        "excerpts": ["Original identity facts."],
        "source_urls": ["https://example.com/source"],
    }
    posting_payload["identity"][field] = {"value": original_value, "origin": original_origin}
    posting_payload["identity"]["source_platform"] = {
        "value": "University job board", "origin": "source",
    }
    card = PostingCard(
        import_key=uuid4(),
        posting=PostingDetails.model_validate(posting_payload),
        posting_alias="My card alias",
    )
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request(
        posting_alias=card.posting_alias, source_platform="University job board",
    )
    expected = card.model_dump(mode="json")

    with TestClient(create_app(database_path=database_path)) as client:
        for value, origin in [
            (original_value, original_origin),
            (new_value, "user_defined"),
            (None, None),
            (new_value, "user_defined"),
            (original_value, original_origin),
        ]:
            request[field] = value
            response = client.patch(f"/posting-cards/{card.card_key}", json=request)
            expected["posting"]["identity"][field] = (
                None if origin is None else {"value": value, "origin": origin}
            )
            assert response.status_code == 200
            assert response.json() == expected
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected
            assert client.get("/posting-cards").json() == [expected]
            assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
                card.model_dump(mode="json")
            )

            reopened_store = PostingCardStore(database_path)
            assert reopened_store.get_by_card_key(card.card_key).model_dump(mode="json") == expected
            assert reopened_store.get_original_by_card_key(card.card_key) == card
            # Query columns must track current values, including clearing them.
            identity = expected["posting"]["identity"]
            with sqlite3.connect(database_path) as connection:
                row = connection.execute(
                    "SELECT position_title, company_name FROM posting_cards WHERE card_key = ?",
                    (str(card.card_key),),
                ).fetchone()
            assert row == (
                identity["position_title"]["value"] if identity["position_title"] else None,
                identity["company_name"]["value"] if identity["company_name"] else None,
            )


def test_http_adds_missing_identity_and_keeps_it_on_later_saves(tmp_path):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    for field in IDENTITY_FIELDS:
        posting_payload["identity"][field] = None
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload))
    store = PostingCardStore(database_path)
    store.add(card)
    values = {
        "position_title": "Software Engineer",
        "company_name": "Example GmbH",
        "department_name": "Research & Development",
        "external_job_id": "DE-00042/A",
    }
    request = make_card_update_request(**values)
    expected = card.model_dump(mode="json")
    for field, value in values.items():
        expected["posting"]["identity"][field] = {"value": value, "origin": "user_defined"}

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

        request["user_notes"] = "Only notes change on this save."
        expected["user_notes"] = request["user_notes"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

        for field in IDENTITY_FIELDS:
            request[field] = None
            expected["posting"]["identity"][field] = None
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected
        assert client.get("/posting-cards").json() == [expected]

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key).model_dump(mode="json") == expected
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field", IDENTITY_FIELDS)
@pytest.mark.parametrize("value", [123, ["Not text"], {"value": "Forged fact", "origin": "source"}])
def test_http_rejects_invalid_identity_without_writing(tmp_path, field, value):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request(**{field: value})

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field", IDENTITY_FIELDS)
def test_http_requires_identity_in_full_card_update(tmp_path, field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request[field]

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
