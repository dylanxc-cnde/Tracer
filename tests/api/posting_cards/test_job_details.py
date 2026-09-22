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


JOB_DETAIL_CASES = [
    ("classification", "workload_type", "part_time", "either", None),
    ("classification", "role_families", ["working_student", "internship"], ["regular_employment"], []),
    ("classification", "contract_type", "fixed_term", "permanent", None),
    ("classification", "seniority", "student", "experienced", None),
    ("work_conditions", "work_modes", ["hybrid", "remote"], ["onsite"], []),
    ("classification", "internship_requirement", "mandatory", "not_applicable", None),
    ("classification", "eligibility", "Enrollment required.", "Any subject accepted.", None),
]


@pytest.mark.parametrize("origin", ["source", "user_defined"])
def test_http_reads_and_preserves_eligibility_when_updating_other_fields(tmp_path, origin):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload["classification"]["eligibility"] = {
        "value": "Enrollment required; Computer Science or a related degree.",
        "origin": origin,
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["user_notes"] = "Review eligibility before applying."
    request["eligibility"] = payload["classification"]["eligibility"]["value"]

    with TestClient(create_app(database_path=database_path)) as client:
        for suffix in ("", "/original"):
            response = client.get(f"/posting-cards/{card.card_key}{suffix}")
            assert response.status_code == 200
            assert response.json()["posting"]["classification"] == payload["classification"]

        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json()["posting"]["classification"] == payload["classification"]
        assert response.json()["user_notes"] == request["user_notes"]

    assert store.get_by_card_key(card.card_key).posting.classification == card.posting.classification
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("original_origin", ["source", "user_defined"])
@pytest.mark.parametrize("section,field,original_value,new_value,empty_value", JOB_DETAIL_CASES)
def test_http_job_details_edit_clear_and_restore(
    tmp_path, original_origin, section, field, original_value, new_value, empty_value,
):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload[section][field] = {"value": original_value, "origin": original_origin}
    payload["classification"]["source"] = {
        "excerpts": ["Original classification evidence"],
        "source_urls": ["https://example.com/job"],
    }
    payload["work_conditions"]["primary_address"] = {"value": "Aachen", "origin": "source"}
    payload["work_conditions"]["address_candidates"] = ["Berlin", "Hamburg"]
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["primary_address"] = "Aachen"
    request["address_candidates"] = ["Berlin", "Hamburg"]
    expected = card.model_dump(mode="json")

    with TestClient(create_app(database_path=database_path)) as client:
        for value, origin in [
            (original_value, original_origin),
            (new_value, "user_defined"),
            (empty_value, None),
            (original_value, original_origin),
        ]:
            request[field] = value
            expected["posting"][section][field] = (
                {"value": value, "origin": origin} if origin is not None else None
            )
            response = client.patch(f"/posting-cards/{card.card_key}", json=request)
            assert response.status_code == 200
            assert response.json() == expected
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected
            assert store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("section,field,original_value,new_value,empty_value", JOB_DETAIL_CASES)
def test_http_job_details_can_fill_missing_values(tmp_path, section, field, original_value, new_value, empty_value):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request[field] = new_value
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json()["posting"][section][field] == {"value": new_value, "origin": "user_defined"}
        request[field] = empty_value
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("origin", ["source", "user_defined"])
@pytest.mark.parametrize("section,field,values", [
    ("classification", "role_families", ["working_student", "internship"]),
    ("work_conditions", "work_modes", ["hybrid", "remote"]),
])
def test_http_job_detail_selection_order_preserves_provenance(tmp_path, origin, section, field, values):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload[section][field] = {"value": values, "origin": origin}
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    with TestClient(create_app(database_path=database_path)) as client:
        request[field] = list(reversed(values))
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
        request[field] = ["other"]
        assert client.patch(f"/posting-cards/{card.card_key}", json=request).status_code == 200
        request[field] = list(reversed(values))
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("field,value", [
    ("workload_type", "working_student"),
    ("workload_type", ["part_time", "full_time"]),
    ("role_families", ["part_time"]),
    ("role_families", ["working_student", "working_student"]),
    ("role_families", None),
    ("contract_type", "student"),
    ("seniority", "permanent"),
    ("work_modes", ["unknown"]),
    ("work_modes", ["hybrid", "hybrid"]),
    ("work_modes", "remote"),
    ("work_modes", None),
    ("internship_requirement", "unknown"),
    ("eligibility", ["Students"]),
    ("eligibility", {"value": "Injected origin", "origin": "source"}),
    ("primary_address", {"value": "Injected address", "origin": "source"}),
    ("primary_address", ["Aachen"]),
    ("primary_address", 123),
    ("address_candidates", [{"address": "Aachen", "primary": 1}]),
    ("address_candidates", "Berlin"),
    ("address_candidates", [123]),
    ("address_candidates", None),
])
def test_http_rejects_invalid_job_detail_updates(tmp_path, field, value):
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


@pytest.mark.parametrize("field", [case[1] for case in JOB_DETAIL_CASES] + ["primary_address", "address_candidates"])
def test_http_requires_job_details_in_full_card_update(tmp_path, field):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request[field]
    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
        assert any(error["loc"] == ["body", field] for error in response.json()["detail"])
    assert store.get_by_card_key(card.card_key) == card


@pytest.mark.parametrize("original_addresses", [[], ["Berlin", "Hamburg"]])
def test_http_address_candidates_edit_clear_and_restore(tmp_path, original_addresses):
    database_path = tmp_path / "tracer.db"
    payload = make_posting_details().model_dump(mode="json")
    payload["work_conditions"]["address_candidates"] = original_addresses
    payload["work_conditions"]["primary_address"] = {"value": "Aachen", "origin": "source"}
    payload["work_conditions"]["source"] = {
        "excerpts": ["Original workplace information."],
        "source_urls": ["https://example.com/workplace"],
    }
    card = PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["primary_address"] = "Aachen"
    expected = card.model_dump(mode="json")

    with TestClient(create_app(database_path=database_path)) as client:
        for addresses in [original_addresses, ["Office B, Köln", "Office C, Berlin"], [], original_addresses]:
            request["address_candidates"] = addresses
            expected["posting"]["work_conditions"]["address_candidates"] = addresses
            response = client.patch(f"/posting-cards/{card.card_key}", json=request)
            assert response.status_code == 200
            assert response.json() == expected
            assert client.get(f"/posting-cards/{card.card_key}").json() == expected
            assert store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)

        # Clearing the primary address does not silently promote a candidate.
        request["primary_address"] = None
        request["address_candidates"] = ["Office B, Köln"]
        expected["posting"]["work_conditions"]["primary_address"] = None
        expected["posting"]["work_conditions"]["address_candidates"] = request["address_candidates"]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected
        assert store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card
