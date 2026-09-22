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
    ("field_name", "original_value", "new_value"),
    [
        ("primary_address", "Example Street 1, Aachen", "New Street 2, Berlin"),
        ("schedule", "Flexible", "Weekdays"),
        ("travel_requirement", "Occasional travel", "No travel"),
        ("start_on", "2026-10-01", "2026-12-15"),
        ("duration", "Six months", "One year"),
    ],
)
@pytest.mark.parametrize("has_original_value", [True, False])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
def test_http_work_condition_text_add_edit_delete_and_restore(
    tmp_path, field_name, original_value, new_value, has_original_value, original_origin
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    conditions = posting_payload["work_conditions"]
    conditions["source"] = {
        "excerpts": ["Original work conditions."],
        "source_urls": ["https://example.com/jobs/conditions"],
    }
    conditions["primary_address"] = {
        "origin": "source", "value": "Example Street 1, Aachen, Germany"
    }
    conditions["address_candidates"] = ["Candidate Street 2, Aachen"]
    conditions["work_modes"] = {"value": ["hybrid"], "origin": "source"}
    conditions[field_name] = (
        {"value": original_value, "origin": original_origin} if has_original_value else None
    )
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    expected_payload = card.model_dump(mode="json")
    changes = [
        (new_value, {"value": new_value, "origin": "user_defined"}),
        (new_value, {"value": new_value, "origin": "user_defined"}),
        (None, None),
        (original_value if has_original_value else None, conditions[field_name]),
    ]
    update_request["work_modes"] = conditions["work_modes"]["value"]
    update_request["primary_address"] = (
        conditions["primary_address"]["value"] if conditions["primary_address"] is not None else None
    )
    update_request["address_candidates"] = conditions["address_candidates"]
    with TestClient(create_app(database_path=database_path)) as client:
        for value, expected_field in changes:
            update_request[field_name] = value
            response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
            expected_payload["posting"]["work_conditions"][field_name] = expected_field
            assert response.status_code == 200
            assert response.json() == expected_payload
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
            assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
                PostingCard.model_validate(expected_payload)
            )
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("has_original_hours", [True, False])
@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize(
    ("minimum", "maximum"), [(0, 0), (20, 20), (10.5, 25.5), (None, 20), (15, None)]
)
def test_http_weekly_hours_add_edit_delete_and_restore(
    tmp_path, has_original_hours, original_origin, minimum, maximum
):
    database_path = tmp_path / "tracer.db"
    posting_payload = make_posting_details().model_dump(mode="json")
    conditions = posting_payload["work_conditions"]
    conditions["source"] = {"excerpts": ["Work from 8 to 40 hours per week."], "source_urls": []}
    conditions["weekly_hours"] = (
        {"minimum": 8, "maximum": 40, "origin": original_origin}
        if has_original_hours else None
    )
    card = PostingCard(
        import_key=uuid4(), posting=PostingDetails.model_validate(posting_payload)
    )
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    expected_payload = card.model_dump(mode="json")
    with TestClient(create_app(database_path=database_path)) as client:
        for lower, upper, expected_hours in [
            (minimum, maximum, {"minimum": minimum, "maximum": maximum, "origin": "user_defined"}),
            (None, None, None),
            (8 if has_original_hours else None, 40 if has_original_hours else None, conditions["weekly_hours"]),
        ]:
            update_request["weekly_hours_minimum"] = lower
            update_request["weekly_hours_maximum"] = upper
            response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
            expected_payload["posting"]["work_conditions"]["weekly_hours"] = expected_hours
            assert response.status_code == 200
            assert response.json() == expected_payload
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected_payload
            assert PostingCardStore(database_path).get_by_card_key(card.card_key) == (
                PostingCard.model_validate(expected_payload)
            )
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == (
            card.model_dump(mode="json")
        )
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"weekly_hours_minimum": -1},
        {"weekly_hours_maximum": -1},
        {"weekly_hours_minimum": True},
        {"weekly_hours_maximum": "20"},
        {"weekly_hours_minimum": "not a number"},
        {"weekly_hours_minimum": 40, "weekly_hours_maximum": 20},
        {"schedule": ["Not text"]},
        {"travel_requirement": 42},
        {"start_on": "2026-02-30"},
        {"start_on": "not a date"},
        {"duration": {"value": "Six months", "origin": "source"}},
        {"work_conditions": {"source": {"excerpts": ["Cannot replace sources"]}}},
    ],
)
def test_http_rejects_invalid_work_conditions_without_changing_storage(tmp_path, invalid_fields):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    update_request = make_card_update_request()
    update_request.update(invalid_fields)
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=update_request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
