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


@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize(
    ("field", "original_value", "new_value"),
    [
        ("canonical_posting_url", "https://example.com/job", "https://example.org/updated"),
        ("source_platform", "Company careers", "University job board"),
        ("published_on", "2020-01-15", "2024-02-29"),
        ("posting_language", "Deutsch", "English"),
    ],
)
def test_http_updates_clears_and_restores_posting_info(
    tmp_path, original_origin, field, original_value, new_value,
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    posting_payload["identity"]["source"] = {
        "excerpts": ["Original posting information."],
        "source_urls": ["https://example.com/source"],
    }
    posting_payload["identity"][field] = {"value": original_value, "origin": original_origin}
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
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
    assert reopened_store.get_by_card_key(card.card_key) == card
    assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_adds_posting_info_and_preserves_it_on_later_saves(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    values = {
        "canonical_posting_url": "https://example.com/job",
        "source_platform": "Company careers",
        "published_on": "2024-02-29",
        "posting_language": "Deutsch",
    }
    request.update(values)
    expected = card.model_dump(mode="json")
    for field, value in values.items():
        expected["posting"]["identity"][field] = {"value": value, "origin": "user_defined"}

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

        request["posting_alias"] = "My saved alias"
        expected["posting_alias"] = request["posting_alias"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected

        for field in values:
            request[field] = None
            expected["posting"]["identity"][field] = None
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

    reopened_store = PostingCardStore(database_path)
    assert reopened_store.get_by_card_key(card.card_key).model_dump(mode="json") == expected
    assert reopened_store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("canonical_posting_url", "javascript:alert(1)"),
        ("canonical_posting_url", "ftp://example.com/job"),
        ("canonical_posting_url", "example.com/job"),
        ("canonical_posting_url", "https://"),
        ("canonical_posting_url", ""),
        ("canonical_posting_url", {"value": "https://example.com", "origin": "source"}),
        ("published_on", "2027-13-23"),
        ("published_on", "2026-02-29"),
        ("published_on", "2026-04-31"),
        ("published_on", "not a date"),
        ("source_platform", ["Not text"]),
        ("posting_language", {"value": "Deutsch", "origin": "source"}),
    ],
)
def test_http_rejects_invalid_posting_info_without_writing(tmp_path, field, value):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request[field] = value

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "field", ["canonical_posting_url", "source_platform", "published_on", "posting_language"],
)
def test_http_requires_posting_info_in_full_card_update(tmp_path, field):
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
