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
        assert first.json() == {"card_key": first_key, "watched_at": watched_at}
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
