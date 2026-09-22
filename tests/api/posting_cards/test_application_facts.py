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
    ("request_field", "posting_field", "original_value", "new_value", "empty_value"),
    [
        ("application_channels", "channels", ["portal", "email"], ["postal", "other"], []),
        (
            "application_url", "application_url",
            "https://example.com/apply", "https://example.org/new-application", None,
        ),
        ("application_deadline", "application_deadline", "2026-12-01", "2028-02-29", None),
        ("required_email_subject", "required_email_subject", "Job 123", "New subject", None),
    ],
)
def test_http_updates_clears_and_restores_application_facts(
    tmp_path, original_origin, request_field, posting_field,
    original_value, new_value, empty_value,
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    application = posting_payload["application_instructions"]
    application["source"] = {
        "excerpts": ["Original application instructions."],
        "source_urls": ["https://example.com/job", "https://example.com/apply"],
    }
    application[posting_field] = {"value": original_value, "origin": original_origin}
    application["required_documents"] = [{"value": "CV", "origin": "source"}]
    application["special_instructions"] = [{"value": "Use PDF", "origin": "source"}]
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["required_documents"] = ["CV"]
    request["special_instructions"] = ["Use PDF"]
    expected = card.model_dump(mode="json")

    with TestClient(create_app(database_path=database_path)) as client:
        for value, origin in [
            (original_value, original_origin),
            (new_value, "user_defined"),
            (empty_value, None),
            (new_value, "user_defined"),
            (original_value, original_origin),
        ]:
            request[request_field] = value
            response = client.patch(f"/posting-cards/{card.card_key}", json=request)
            expected["posting"]["application_instructions"][posting_field] = (
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


def test_http_adds_application_facts_to_empty_card_and_preserves_saved_changes(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request.update({
        "application_channels": ["portal", "email", "postal", "other"],
        "application_url": "https://example.com/apply",
        "application_deadline": "2020-01-01",  # Past deadlines remain valid facts.
        "required_email_subject": "Application for job 123",
        "role_summary": "My saved summary",
    })
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        saved = response.json()
        application = saved["posting"]["application_instructions"]
        for request_field, posting_field in [
            ("application_channels", "channels"),
            ("application_url", "application_url"),
            ("application_deadline", "application_deadline"),
            ("required_email_subject", "required_email_subject"),
        ]:
            assert application[posting_field] == {
                "value": request[request_field], "origin": "user_defined",
            }
        assert application["source"] == {"excerpts": [], "source_urls": []}

        request["posting_alias"] = "My renamed card"
        request["application_channels"].reverse()
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        saved["posting_alias"] = request["posting_alias"]
        assert response.status_code == 200
        assert response.json() == saved  # Only alias changed; channel order is not an edit.
        assert client.get(f"/posting-cards/{card.card_key}").json() == saved

    assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
        PostingCard.model_validate(saved)
    )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("original_channels", [["email", "portal"], ["email", "portal", "email"]])
def test_http_channel_selection_order_does_not_change_original_provenance(tmp_path, original_channels):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload["application_instructions"]["channels"] = {
        "value": original_channels, "origin": "source",
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    with TestClient(create_app(database_path=database_path)) as client:
        request["application_channels"] = ["portal", "email"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")

        request["application_channels"] = ["other"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        request["application_channels"] = ["portal", "email"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("application_channels", ["email", "email"]),
        ("application_channels", ["unknown"]),
        ("application_channels", "email"),
        ("application_channels", None),
        ("application_channels", [{"value": "email", "origin": "source"}]),
        ("application_url", "javascript:alert(1)"),
        ("application_url", "ftp://example.com/apply"),
        ("application_url", "example.com/apply"),
        ("application_url", "https://"),
        ("application_url", ""),
        ("application_deadline", "2027-13-23"),
        ("application_deadline", "2027-02-29"),
        ("application_deadline", "2028-04-31"),
        ("application_deadline", "2028-02-"),
        ("application_deadline", "0000-01-01"),
        ("required_email_subject", ["Subject"]),
        ("required_email_subject", {"value": "Subject", "origin": "source"}),
    ],
)
def test_http_rejects_invalid_application_fact_updates_without_writing(tmp_path, field, value):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request[field] = value
    request["posting_alias"] = "Must not be saved either"
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(error["loc"][:2] == ["body", field] for error in response.json()["detail"])
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "field",
    ["application_channels", "application_url", "application_deadline", "required_email_subject"],
)
def test_http_requires_application_facts_in_card_update(tmp_path, field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request[field]
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(
            error["loc"] == ["body", field] and error["type"] == "missing"
            for error in response.json()["detail"]
        )
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
