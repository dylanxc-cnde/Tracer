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


def make_requirement_card():
    payload = make_posting_details().model_dump(mode="json")
    # Interleaved importance levels and repeated ANY_OF boxes are intentional.
    group_values = [
        ("preferred", "any_of", "source", ["Git", "Mercurial"], False),
        ("required", "all_of", "source", ["Python", "SQL"], False),
        ("unknown", "unknown", "source", ["Distributed systems"], False),
        ("required", "any_of", "user_defined", ["Rust", "Go"], False),
        ("required", "any_of", "source", ["Docker", "Podman"], False),
        ("required", "unknown", "source", ["GraphQL"], True),
        ("preferred", "all_of", "source", ["Testing"], False),
    ]
    payload["requirements"] = {
        "source": {
            "excerpts": ["Original requirement evidence."],
            "source_urls": ["https://example.com/job"],
        },
        "groups": [
            {
                "importance": importance,
                "item_rule": rule,
                "origin": origin,
                "items": [
                    {"name": name, "category": "skill", "is_example": is_example}
                    for name in names
                ],
            }
            for importance, rule, origin, names, is_example in group_values
        ],
    }
    return PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))


@pytest.mark.parametrize("importance", ["required", "preferred", "unknown", None])
def test_http_deletes_requirement_sections_and_restores_original(tmp_path, importance):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    original = card.model_dump(mode="json")
    remaining = [
        group for group in original["posting"]["requirements"]["groups"]
        if importance is not None and group["importance"] != importance
    ]
    request = make_card_update_request()
    request["requirement_groups"] = [
        {key: value for key, value in group.items() if key != "origin"}
        for group in remaining
    ]
    expected = card.model_dump(mode="json")
    expected["posting"]["requirements"]["groups"] = remaining

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected
        assert client.get(f"/posting-cards/{card.card_key}/original").json() == original
        reopened_store = PostingCardStore(database_path)
        assert reopened_store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)
        assert reopened_store.get_original_by_card_key(card.card_key) == card

        # A frontend section draft may regroup the original cross-section order.
        request["requirement_groups"] = sorted(
            [group.model_dump(mode="json", exclude={"origin"}) for group in card.posting.requirements.groups],
            key=lambda group: group["importance"],
        )
        restored = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert restored.status_code == 200
        assert restored.json() == original


def test_http_requirement_noop_preserves_order_origins_and_examples(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["requirement_groups"] = sorted(
        [group.model_dump(mode="json", exclude={"origin"}) for group in card.posting.requirements.groups],
        key=lambda group: group["importance"],
    )
    request["requirement_groups"].extend([
        {"importance": "unknown", "item_rule": "all_of", "items": []},
        {"importance": "preferred", "item_rule": "any_of", "items": []},
    ])
    request["user_notes"] = "Changed another field, not requirements."

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json()["posting"] == card.posting.model_dump(mode="json")
        assert response.json()["user_notes"] == request["user_notes"]
    assert store.get_original_by_card_key(card.card_key) == card


def test_http_requirement_groups_use_server_owned_origin(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["requirement_groups"] = [
        group.model_dump(mode="json", exclude={"origin"})
        for group in card.posting.requirements.groups
    ]
    request["requirement_groups"][1]["items"][0]["name"] = "TypeScript"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        requirements = response.json()["posting"]["requirements"]
        assert requirements["groups"][1]["origin"] == "user_defined"
        assert requirements["groups"][1]["items"][0]["name"] == "TypeScript"
        assert requirements["source"] == card.posting.requirements.source.model_dump(mode="json")
        assert requirements["groups"][0] == card.posting.requirements.groups[0].model_dump(mode="json")
        request["requirement_groups"][1]["items"][0]["name"] = "Python"
        restored = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert restored.status_code == 200
        assert restored.json() == card.model_dump(mode="json")
    assert store.get_original_by_card_key(card.card_key) == card


@pytest.mark.parametrize("invalid_groups", [
    None,
    "Not a list",
    [{"importance": "urgent", "item_rule": "all_of", "items": []}],
    [{"importance": "required", "item_rule": "xor", "items": []}],
    [{"importance": "required", "item_rule": "all_of", "items": [], "id": "draft-id"}],
    [{"importance": "required", "item_rule": "all_of", "items": [], "origin": "source"}],
    [{"importance": "required", "item_rule": "all_of", "items": [], "source": {}}],
    [{"importance": "required", "item_rule": "all_of", "items": [{"name": "Python"}]}],
])
def test_http_rejects_invalid_requirement_updates_without_writing(tmp_path, invalid_groups):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["requirement_groups"] = invalid_groups

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 422
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card


def test_http_requirement_item_edits_persist_and_restore_original(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    original_groups = [
        group.model_dump(mode="json", exclude={"origin"})
        for group in card.posting.requirements.groups
    ]
    request["requirement_groups"] = [
        group.model_dump(mode="json", exclude={"origin"})
        for group in card.posting.requirements.groups
    ]
    groups = request["requirement_groups"]
    groups[1]["items"][0]["name"] = "Advanced Python"
    groups[1]["items"].pop(1)  # Delete SQL without changing the other groups.
    groups[1]["items"].append({"name": "TypeScript", "category": "skill", "is_example": False})
    groups[5]["items"][0]["name"] = "REST"  # Preserve the example marker.

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        saved = response.json()
        requirements = saved["posting"]["requirements"]
        assert requirements["groups"][1]["items"] == groups[1]["items"]
        assert requirements["groups"][1]["origin"] == "user_defined"
        assert requirements["groups"][5]["items"] == groups[5]["items"]
        assert requirements["groups"][5]["origin"] == "user_defined"
        assert requirements["groups"][5]["items"][0]["is_example"] is True
        for index in (0, 2, 3, 4, 6):
            assert requirements["groups"][index] == card.posting.requirements.groups[index].model_dump(mode="json")
        assert requirements["source"] == card.posting.requirements.source.model_dump(mode="json")
        assert client.get(f"/posting-cards/{card.card_key}").json() == saved
        reopened_store = PostingCardStore(database_path)
        assert reopened_store.get_by_card_key(card.card_key) == PostingCard.model_validate(saved)
        assert reopened_store.get_original_by_card_key(card.card_key) == card

        request["requirement_groups"] = original_groups
        restored = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert restored.status_code == 200
        assert restored.json() == card.model_dump(mode="json")


@pytest.mark.parametrize("group_index", [1, 5])
def test_http_requirement_example_toggle_persists_and_restores_original(tmp_path, group_index):
    database_path = tmp_path / "tracer.db"
    card = make_requirement_card()
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    request["requirement_groups"] = [
        group.model_dump(mode="json", exclude={"origin"})
        for group in card.posting.requirements.groups
    ]
    # Exercise both directions without moving the item or changing its other fields.
    item = request["requirement_groups"][group_index]["items"][0]
    item["is_example"] = not item["is_example"]
    expected = card.model_dump(mode="json")
    expected_group = expected["posting"]["requirements"]["groups"][group_index]
    expected_group["items"][0]["is_example"] = item["is_example"]
    expected_group["origin"] = "user_defined"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == expected
        assert client.get(f"/posting-cards/{card.card_key}").json() == expected
        reopened_store = PostingCardStore(database_path)
        assert reopened_store.get_by_card_key(card.card_key) == PostingCard.model_validate(expected)
        assert reopened_store.get_original_by_card_key(card.card_key) == card

        # Toggling back restores the original group origin as well as its contents.
        item["is_example"] = not item["is_example"]
        restored = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert restored.status_code == 200
        assert restored.json() == card.model_dump(mode="json")
        assert reopened_store.get_original_by_card_key(card.card_key) == card


def test_http_requires_requirement_groups_and_cleans_empty_additions(tmp_path):
    database_path = tmp_path / "tracer.db"
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store = PostingCardStore(database_path)
    store.add(card)
    request = make_card_update_request()
    del request["requirement_groups"]

    with TestClient(create_app(database_path=database_path)) as client:
        missing = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert missing.status_code == 422
        assert any(
            error["loc"] == ["body", "requirement_groups"] and error["type"] == "missing"
            for error in missing.json()["detail"]
        )
        request["requirement_groups"] = [
            {"importance": "required", "item_rule": "all_of", "items": []},
            {"importance": "unknown", "item_rule": "any_of", "items": []},
        ]
        response = client.patch(f"/posting-cards/{card.card_key}", json=request)
        assert response.status_code == 200
        assert response.json() == card.model_dump(mode="json")
    assert store.get_by_card_key(card.card_key) == card
    assert store.get_original_by_card_key(card.card_key) == card
