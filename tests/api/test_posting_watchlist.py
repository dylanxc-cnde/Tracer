import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.api.factories import make_posting_details
from tracer.api.app import create_app
from tracer.postings.models.posting_card import PostingCard
from tracer.postings.stores.posting_card_store import PostingCardStore


WATCHLIST_PATH = "/posting/watchlist"
ACTIVITY_WINDOW = {"from": "2000-01-01T00:00:00Z", "to": "2100-01-01T00:00:00Z"}


@pytest.fixture
def database_path(tmp_path):
    return tmp_path / "tracer.sqlite3"


@pytest.fixture
def client(database_path):
    with TestClient(create_app(database_path=database_path)) as api:
        yield api


def add_saved_card(store):
    # A saved Card remains watchable even without a surviving import receipt.
    card = PostingCard(import_key=uuid4(), posting=make_posting_details())
    store.add(card)
    return str(card.card_key)


def test_watchlist_retains_first_membership_time_and_survives_app_reopen(database_path):
    cards = PostingCardStore(database_path)
    first_key = add_saved_card(cards)
    second_key = add_saved_card(cards)
    first_path = f"{WATCHLIST_PATH}/{first_key}"
    second_path = f"{WATCHLIST_PATH}/{second_key}"

    with TestClient(create_app(database_path=database_path)) as client:
        before = client.get(f"/posting/card/{first_key}").json()
        assert client.get(WATCHLIST_PATH).json() == []
        first = client.put(first_path)
        second = client.put(second_path)
        repeated = client.put(first_path)

        assert first.status_code == second.status_code == repeated.status_code == 200
        watched_at = first.json()["watched_at"]
        assert watched_at.endswith("Z")
        assert first.json() == {
            "card_key": first_key,
            "watched_at": watched_at,
            "last_source_check": None,
        }
        assert repeated.json() == first.json()
        assert client.get(WATCHLIST_PATH).json() == [second.json(), first.json()]
        assert client.get(f"/posting/card/{first_key}").json() == before
        assert (
            client.get("/home/activity", params=ACTIVITY_WINDOW).json()["events"] == []
        )

    with TestClient(create_app(database_path=database_path)) as client:
        assert client.get(WATCHLIST_PATH).json() == [second.json(), first.json()]
        assert client.put(first_path).json() == first.json()
        for _ in range(2):
            removed = client.delete(first_path)
            assert removed.status_code == 204
            assert removed.content == b""
        assert client.get(WATCHLIST_PATH).json() == [second.json()]
        assert client.get(f"/posting/card/{first_key}").json() == before


def test_unknown_card_cannot_be_watched_but_removal_is_idempotent(client):
    path = f"{WATCHLIST_PATH}/{uuid4()}"
    response = client.put(path)

    assert response.status_code == 404
    assert response.json() == {"detail": "Posting card not found"}
    assert client.delete(path).status_code == 204
    assert client.get(WATCHLIST_PATH).json() == []


def test_card_deletion_cascades_watch_without_removing_home_application(
    client, database_path
):
    cards = PostingCardStore(database_path)
    card_key = add_saved_card(cards)
    second_key = add_saved_card(cards)
    assert client.put(f"{WATCHLIST_PATH}/{card_key}").status_code == 200
    other = client.put(f"{WATCHLIST_PATH}/{second_key}")
    assert other.status_code == 200
    application_id = str(uuid4())
    assert (
        client.post(
            "/home/applications",
            json={
                "application_id": application_id,
                "card_key": card_key,
                "applied_on": "2026-11-27",
            },
        ).status_code
        == 201
    )

    assert client.delete(f"/posting/card/{card_key}").status_code == 204
    assert client.get(WATCHLIST_PATH).json() == [other.json()]

    with closing(sqlite3.connect(database_path)) as database:
        assert database.execute(
            "SELECT card_key FROM home_applications WHERE application_id = ?",
            (application_id,),
        ).fetchone() == (card_key,)


def test_concurrent_identical_watches_keep_one_membership(client, database_path):
    key = add_saved_card(PostingCardStore(database_path))
    path = f"{WATCHLIST_PATH}/{key}"
    start = Barrier(2)

    def watch():
        start.wait(timeout=5)
        return client.put(path)

    with ThreadPoolExecutor(2) as workers:
        first = workers.submit(watch)
        second = workers.submit(watch)
        first_response, second_response = (
            first.result(timeout=10),
            second.result(timeout=10),
        )

    assert first_response.status_code == second_response.status_code == 200
    assert first_response.json() == second_response.json()
    assert client.get(WATCHLIST_PATH).json() == [first_response.json()]


def test_watchlist_projects_latest_manual_observation_without_copying_source(
    client,
    database_path,
):
    source_url = "https://example.com/jobs/mobility"
    source_text = "Synthetic text kept only in the import receipt."
    imported = client.post(
        "/posting/import",
        json={"kind": "text", "text": source_text, "source_url": source_url},
    )
    assert imported.status_code == 201
    import_key = imported.json()["import_key"]
    created = client.post(
        "/posting/card",
        json={
            "import_key": import_key,
            "posting": make_posting_details().model_dump(mode="json"),
        },
    )
    assert created.status_code == 201
    key = created.json()["card_key"]
    checks_path = f"/posting/card/{key}/source-checks"
    watch_path = f"{WATCHLIST_PATH}/{key}"

    def record_result(result):
        response = client.post(
            checks_path, json={"check_id": str(uuid4()), "result": result}
        )
        assert response.status_code == 201
        check = response.json()
        return {"result": result, "recorded_at": check["recorded_at"]}

    first_check = record_result("listed")
    watched = client.put(watch_path)
    assert watched.status_code == 200
    assert watched.json()["last_source_check"] == first_check
    later_key = add_saved_card(PostingCardStore(database_path))
    unchecked = client.put(f"{WATCHLIST_PATH}/{later_key}")
    assert unchecked.status_code == 200
    assert unchecked.json()["last_source_check"] is None

    record_result("not_listed")
    latest = record_result("unable_to_confirm")
    expected = {**watched.json(), "last_source_check": latest}
    assert client.get(WATCHLIST_PATH).json() == [unchecked.json(), expected]
    replay = client.put(watch_path)
    assert replay.status_code == 200
    assert replay.json() == expected
    assert replay.json()["watched_at"] == watched.json()["watched_at"]

    assert client.delete(f"/posting/import/{import_key}").status_code == 204
    history = client.get(WATCHLIST_PATH)
    assert history.status_code == 200
    assert history.json() == [unchecked.json(), expected]
    assert source_url not in history.text
    assert source_text not in history.text
    assert client.put(watch_path).json() == expected
