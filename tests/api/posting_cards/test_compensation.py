from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tracer.api.app import create_app
from tracer.api.models import UpdateCompensationEntryRequest
from tracer.postings import PostingCard, PostingDetails
from tracer.postings.stores.posting_card_store import PostingCardStore

from tests.api.factories import (
    make_card_update_request,
    make_posting_details,
)


def make_compensation_entry(**changes):
    entry = {
        "compensation_type": "base_salary",
        "minimum_amount": 18.5,
        "maximum_amount": 20,
        "currency": "EUR",
        "period": "hour",
        "pay_basis": "gross",
        "applicable_groups": ["Bachelor"],
        "payment_conditions": None,
    }
    entry.update(changes)
    return entry


@pytest.mark.parametrize(
    ("new_entries", "expected_origins"),
    [
        ([make_compensation_entry()], ["source"]),
        ([make_compensation_entry(minimum_amount=19)], ["user_defined"]),
        (
            [
                make_compensation_entry(
                    minimum_amount=22, maximum_amount=25, applicable_groups=["Master"]
                ),
                make_compensation_entry(),
            ],
            ["user_defined", "source"],
        ),
        ([make_compensation_entry(), make_compensation_entry()], ["source", "source"]),
        (
            [
                make_compensation_entry(compensation_type="bonus", period="one_time"),
                make_compensation_entry(compensation_type="bonus", period="year"),
                make_compensation_entry(compensation_type="allowance", currency="Credits"),
                make_compensation_entry(compensation_type="other", pay_basis="net"),
            ],
            ["user_defined"] * 4,
        ),
        (
            [make_compensation_entry(
                minimum_amount=None, maximum_amount=None, currency=None,
                period=None, pay_basis="unknown", applicable_groups=["Student"],
                payment_conditions="After probation",
            )],
            ["user_defined"],
        ),
        ([make_compensation_entry(minimum_amount=0, maximum_amount=0)], ["user_defined"]),
        ([make_compensation_entry(minimum_amount=None)], ["user_defined"]),
        ([make_compensation_entry(maximum_amount=None)], ["user_defined"]),
        ([], []),
    ],
)
def test_http_updates_and_restores_compensation_entries(
    tmp_path, new_entries, expected_origins
):
    database_path = tmp_path / "tracer.db"
    posting = make_posting_details().model_dump(mode="json")
    original_entries = [
        {**make_compensation_entry(), "origin": "source"},
        {
            **make_compensation_entry(minimum_amount=22, maximum_amount=25, applicable_groups=["Master"]),
            "origin": "user_defined",
        },
    ]
    posting["compensation"] = {
        "source": {
            "excerpts": ["Hourly pay depends on the degree program."],
            "source_urls": ["https://example.com/jobs/pay"],
        },
        "entries": original_entries,
        "benefits": [{"value": "Training budget", "origin": "source"}],
        "vacation_days": {"value": 30, "origin": "source"},
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(posting))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["compensation_entries"] = new_entries
    request["benefits"] = ["Training budget"]
    request["vacation_days"] = 30

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        expected = card.model_dump(mode="json")
        expected["posting"]["compensation"]["entries"] = [
            {**entry, "origin": origin}
            for entry, origin in zip(new_entries, expected_origins, strict=True)
        ]
        assert response.json() == expected
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected
        assert store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)

        request["posting_alias"] = "After editing salary"
        expected["posting_alias"] = request["posting_alias"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected

        request["compensation_entries"] = [
            entry.model_dump(mode="json", exclude={"origin"})
            for entry in card.posting.compensation.entries
        ]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        expected["posting"]["compensation"]["entries"] = original_entries
        assert response.status_code == 200
        assert response.json() == expected
        assert store.get_original_by_card_key(card.card_key) == card
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == card.model_dump(mode="json")


@pytest.mark.parametrize(
    "invalid_entries",
    [
        None, "Salary", {}, [None], [{}],
        [make_compensation_entry(minimum_amount=-1)],
        [make_compensation_entry(maximum_amount=-1)],
        [make_compensation_entry(minimum_amount=30, maximum_amount=20)],
        [make_compensation_entry(minimum_amount=True)],
        [make_compensation_entry(maximum_amount="20")],
        [make_compensation_entry(compensation_type="salary")],
        [make_compensation_entry(period="day")],
        [make_compensation_entry(pay_basis="taxed")],
        [make_compensation_entry(currency=42)],
        [make_compensation_entry(applicable_groups="Bachelor")],
        [make_compensation_entry(applicable_groups=[1])],
        [make_compensation_entry(payment_conditions=42)],
        [make_compensation_entry(origin="source")],
        [make_compensation_entry(source={"excerpts": [], "source_urls": []})],
        [make_compensation_entry(id="draft-only-id")],
    ],
)
def test_http_rejects_invalid_compensation_without_changing_storage(tmp_path, invalid_entries):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["compensation_entries"] = invalid_entries
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


def test_http_requires_compensation_entries_in_update(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request["compensation_entries"]
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(error["loc"] == ["body", "compensation_entries"] for error in response.json()["detail"])
    assert store.get_by_card_key(card.card_key) == card


@pytest.mark.parametrize("amount", [float("nan"), float("inf"), float("-inf")])
@pytest.mark.parametrize("bound", ["minimum_amount", "maximum_amount"])
def test_compensation_update_rejects_non_finite_amounts(bound, amount):
    with pytest.raises(ValidationError):
        UpdateCompensationEntryRequest.model_validate(make_compensation_entry(**{bound: amount}))
