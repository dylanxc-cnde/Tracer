import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, datetime
from threading import Barrier
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from tests.api.factories import make_card_update_request, make_posting_details
from tracer.api.app import create_app
from tracer.postings.models.posting_card import PostingCard
from tracer.postings.stores import posting_watchlist_store
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


def add_saved_card(store, *, posting_alias=None):
    # A saved Card remains watchable even without a surviving import receipt.
    card = PostingCard(
        import_key=uuid4(), posting=make_posting_details(), posting_alias=posting_alias
    )
    store.add(card)
    return str(card.card_key)


@pytest.fixture
def legacy_memberships(database_path):
    cards = PostingCardStore(database_path)
    memberships = [
        (add_saved_card(cards), "2026-11-28T12:00:00.000000+00:00"),
        (add_saved_card(cards), "2026-11-27T12:00:00.000000+00:00"),
    ]
    with closing(sqlite3.connect(database_path)) as database, database:
        database.execute("""
            CREATE TABLE posting_watchlist (
                card_key TEXT PRIMARY KEY NOT NULL
                    REFERENCES posting_cards(card_key) ON DELETE CASCADE,
                watched_at TEXT NOT NULL
            )
        """)
        database.executemany(
            "INSERT INTO posting_watchlist (card_key, watched_at) VALUES (?, ?)",
            memberships,
        )
    return memberships


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
        watch_id = first.json()["watch_id"]
        assert str(UUID(watch_id)) == watch_id
        assert first.json() == {
            "card_key": first_key,
            "watch_id": watch_id,
            "watched_at": watched_at,
            "last_source_check": None,
            "card_identity": {
                "posting_alias": None,
                "position_title": "Working Student Data Analytics",
                "company_name": "Velora Grid Systems SE",
            },
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


def test_watchlist_projects_current_card_identity_after_correction(
    client, database_path
):
    key = add_saved_card(PostingCardStore(database_path), posting_alias="Earlier alias")
    watch_path = f"{WATCHLIST_PATH}/{key}"
    watched = client.put(watch_path)
    assert watched.status_code == 200
    assert watched.json()["card_identity"]["posting_alias"] == "Earlier alias"

    card_path = f"/posting/card/{key}"
    corrected = {
        "posting_alias": "Meine Auswahl",
        "position_title": "Werkstudentin für Datenanalyse",
        "company_name": "Verkehrsverbund Dresden (DEMO)",
    }
    cleared = dict.fromkeys(corrected)
    for identity in (corrected, cleared):
        response = client.patch(card_path, json=make_card_update_request(**identity))
        assert response.status_code == 200
        expected = {**watched.json(), "card_identity": identity}
        assert client.get(WATCHLIST_PATH).json() == [expected]
        assert client.put(watch_path).json() == expected


@pytest.mark.parametrize(
    "damaged_payload", ['{"posting_alias":', '{"posting_alias":7}']
)
def test_damaged_card_alias_does_not_break_watchlist(
    client, database_path, damaged_payload
):
    cards = PostingCardStore(database_path)
    damaged_key = add_saved_card(cards, posting_alias="Lost alias")
    healthy_key = add_saved_card(cards, posting_alias="Meine Auswahl")
    damaged_path = f"{WATCHLIST_PATH}/{damaged_key}"
    damaged = client.put(damaged_path)
    healthy = client.put(f"{WATCHLIST_PATH}/{healthy_key}")
    assert damaged.status_code == healthy.status_code == 200

    with closing(sqlite3.connect(database_path)) as database, database:
        database.execute(
            "UPDATE posting_cards SET payload_json = ? WHERE card_key = ?",
            (damaged_payload, damaged_key),
        )

    expected_damaged = {
        **damaged.json(),
        "card_identity": {
            "posting_alias": None,
            "position_title": "Working Student Data Analytics",
            "company_name": "Velora Grid Systems SE",
        },
    }
    response = client.get(WATCHLIST_PATH)
    assert response.status_code == 200
    assert response.json() == [healthy.json(), expected_damaged]
    assert healthy.json()["card_identity"]["posting_alias"] == "Meine Auswahl"
    assert client.put(damaged_path).json() == expected_damaged


def test_stale_unwatch_preserves_recreated_membership_at_the_same_time(
    client, database_path, monkeypatch
):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz is UTC
            return cls(2026, 11, 28, 12, tzinfo=UTC)

    monkeypatch.setattr(posting_watchlist_store, "datetime", FrozenDatetime)
    key = add_saved_card(PostingCardStore(database_path))
    path = f"{WATCHLIST_PATH}/{key}"
    first = client.put(path).json()
    expected_first = {"expected_watch_id": first["watch_id"]}

    assert client.delete(path, params=expected_first).status_code == 204
    assert client.delete(path, params=expected_first).status_code == 204
    current = client.put(path).json()
    assert current["watched_at"] == first["watched_at"]
    assert current["watch_id"] != first["watch_id"]
    assert client.put(path).json() == current

    assert client.delete(path, params=expected_first).status_code == 412
    assert (
        client.delete(path, params={"expected_watch_id": "not-a-uuid"}).status_code
        == 422
    )
    assert client.get(WATCHLIST_PATH).json() == [current]
    expected_current = {"expected_watch_id": current["watch_id"]}
    assert client.delete(path, params=expected_current).status_code == 204
    assert client.delete(path, params=expected_current).status_code == 204
    assert client.get(WATCHLIST_PATH).json() == []


def test_watch_ids_are_backfilled_once_for_concurrent_app_startup(
    database_path, legacy_memberships
):
    start = Barrier(2)

    def read_watchlist():
        start.wait(timeout=5)
        with TestClient(create_app(database_path=database_path)) as client:
            response = client.get(WATCHLIST_PATH)
            assert response.status_code == 200
            return response.json()

    with ThreadPoolExecutor(2) as workers:
        first = workers.submit(read_watchlist)
        second = workers.submit(read_watchlist)
        rows = first.result(timeout=10)
        assert second.result(timeout=10) == rows

    assert [(row["card_key"], row["watched_at"]) for row in rows] == [
        (key, watched_at.replace(".000000+00:00", "Z"))
        for key, watched_at in legacy_memberships
    ]
    assert len({UUID(row["watch_id"]) for row in rows}) == len(legacy_memberships)
    with TestClient(create_app(database_path=database_path)) as client:
        key = rows[0]["card_key"]
        assert client.get(WATCHLIST_PATH).json() == rows
        assert client.put(f"{WATCHLIST_PATH}/{key}").json() == rows[0]
        assert client.delete(f"/posting/card/{key}").status_code == 204
        assert client.get(WATCHLIST_PATH).json() == rows[1:]


def test_failed_watch_id_backfill_rolls_back_schema_and_old_rows(
    database_path, legacy_memberships, monkeypatch
):
    generate_id = Mock(
        side_effect=[uuid4(), RuntimeError("Synthetic backfill interruption")]
    )
    monkeypatch.setattr(posting_watchlist_store, "uuid4", generate_id)
    with pytest.raises(RuntimeError, match="Synthetic backfill interruption"):
        posting_watchlist_store.PostingWatchlistStore(database_path)

    with closing(sqlite3.connect(database_path)) as database:
        assert [
            row[1] for row in database.execute("PRAGMA table_info(posting_watchlist)")
        ] == ["card_key", "watched_at"]
        assert (
            database.execute(
                "SELECT card_key, watched_at FROM posting_watchlist ORDER BY watched_at DESC"
            ).fetchall()
            == legacy_memberships
        )


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
