"""Contract tests for the read-only local workspace search API.

Expected behavior comes from the S1 test brief (cases SR-LOCAL, SR-EMPTY-BOUND and
SR-READONLY-SCOPE), goal acceptance 5 and the stage acceptance, written as literals from
the seeded records below. Nothing is derived from the production SQL or serialization code.
Every test uses a temporary SQLite database through TestClient(create_app(...)); no real
database, credential store, provider, model or network is touched.

Approved rules exercised here:
- Search covers saved jobs (title), companies, notes, tasks, events and applications;
  every hit carries a type, a source and an openable target.
- A deleted job keeps its application/event: the hit is marked ``card_missing``.
- Short/empty queries return nothing; "no matches" and "failed" are different responses;
  the result count is bounded.
- Search is read-only and never reaches models, networks, Provider settings or
  Profile/Goal content.
"""

import sqlite3
from collections import Counter
from contextlib import closing
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.settings.api_key_store import ApiKeyStore

from tests.api.factories import (
    make_card_update_request,
    make_create_ai_provider_request,
    make_posting_details,
)


# A long German title and company are the realistic worst case for a result list.
LONG_TITLE = "Werkstudent Datenanalyse, Reporting und Marktkommunikation für Netzentgeltabrechnung"
LONG_COMPANY = "Süddeutsche Energieversorgungs- und Netzinfrastrukturgesellschaft mbH"
PRIVATE_PROFILE = "PRIVATE-PROFILE-SKILL-do-not-search"
PRIVATE_GOAL = "PRIVATE-GOAL-LOCATION-do-not-search"
PRIVATE_PROVIDER = "PRIVATE-PROVIDER-NAME-do-not-search"
SECRET = "SEARCH_TEST_FAKE_SECRET_NOT_A_CREDENTIAL"
INVALID = {"detail": "search.invalid_request"}


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Search tests must not use credentials, AI clients or suppliers")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def database_path(tmp_path):
    return tmp_path / "tracer.sqlite3"


@pytest.fixture
def key_store():
    store = Mock(spec=ApiKeyStore)
    store.save.side_effect = lambda key, secret: None
    return store


@pytest.fixture
def client(database_path, key_store):
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        yield client


# ------------------------------------------------------------------ helpers


def search(client, q, **params):
    return client.get("/search", params={"q": q, **params})


def hits(client, q, **params):
    response = search(client, q, **params)
    assert response.status_code == 200, response.text
    return response.json()


def save_card(client, title, company="Velora Grid Systems SE", notes=None):
    """Save a Card through the real HTTP flow, optionally with a user note."""
    imported = client.post(
        "/posting/import",
        json={"kind": "text", "text": "Posting text for the search tests.", "source_url": None},
    )
    assert imported.status_code == 201
    posting = make_posting_details().model_dump(mode="json")
    posting["identity"]["position_title"]["value"] = title
    posting["identity"]["company_name"]["value"] = company
    response = client.post(
        "/posting/card",
        json={
            "import_key": imported.json()["import_key"],
            "posting": posting,
            "posting_alias": None,
            "user_notes": notes,
            "tags": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def post_task(client, title, due_on=None):
    body = {"task_id": str(uuid4()), "title": title}
    if due_on is not None:
        body["due_on"] = due_on
    response = client.post("/home/tasks", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def post_event(client, title, kind="interview", starts_at="2030-06-12T09:00:00+00:00", **extra):
    response = client.post(
        "/home/events",
        json={"event_id": str(uuid4()), "kind": kind, "title": title, "starts_at": starts_at, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def post_application(client, card_key):
    response = client.post(
        "/home/applications",
        json={"application_id": str(uuid4()), "card_key": card_key, "applied_on": "2030-06-09"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def by_type(body):
    grouped = {}
    for result in body["results"]:
        grouped.setdefault(result["type"], []).append(result)
    return grouped


def table_snapshot(database_path):
    """Every table's full row set, so a search that writes anything changes it."""
    with closing(sqlite3.connect(database_path)) as connection:
        names = sorted(
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        )
        return {
            name: connection.execute(f'SELECT * FROM "{name}" ORDER BY rowid').fetchall()
            for name in names
        }


# ----------------------------------------------------------------- SR-LOCAL


def test_search_finds_every_record_type_with_type_source_and_openable_target(client):
    card = save_card(client, LONG_TITLE, LONG_COMPANY)
    note_card = save_card(client, "Quiet role", "Other GmbH", notes="Bring the Tarifvertrag questions")
    task = post_task(client, "Tarifvertrag Unterlagen ordnen", "2030-06-10")
    event = post_event(client, "Tarifvertrag Gespräch")
    application = post_application(client, card["card_key"])

    # Job title (alias/current title) -> a "job" hit targeting the Card.
    jobs = by_type(hits(client, "Netzentgeltabrechnung"))
    assert [(r["type"], r["title"], r["target"]) for r in jobs["job"]] == [
        ("job", LONG_TITLE, {"kind": "card", "id": card["card_key"]})
    ]
    assert jobs["job"][0]["source"]
    assert jobs["job"][0]["card_missing"] is False

    # Company name -> a "company" hit that opens the owning Card.
    companies = by_type(hits(client, "Netzinfrastruktur"))
    assert [(r["type"], r["target"]) for r in companies["company"]] == [
        ("company", {"kind": "card", "id": card["card_key"]})
    ]

    # Note text -> a "note" hit that opens the Card that owns the note.
    notes = by_type(hits(client, "Bring the Tarifvertrag"))
    assert [(r["type"], r["target"]) for r in notes["note"]] == [
        ("note", {"kind": "card", "id": note_card["card_key"]})
    ]

    # One query reaches tasks, events and notes, each with its own type and target kind.
    mixed = by_type(hits(client, "Tarifvertrag"))
    assert {r["target"]["id"] for r in mixed["task"]} == {task["task_id"]}
    assert {r["target"]["kind"] for r in mixed["task"]} == {"task"}
    assert {r["target"]["id"] for r in mixed["event"]} == {event["event_id"]}
    assert {r["target"]["kind"] for r in mixed["event"]} == {"event"}
    assert {r["target"]["id"] for r in mixed["note"]} == {note_card["card_key"]}

    # Applications are found through their linked job, and open the application itself.
    applied = by_type(hits(client, "Netzentgeltabrechnung"))
    assert [(r["type"], r["target"]) for r in applied["application"]] == [
        ("application", {"kind": "application", "id": application["application_id"]})
    ]

    # Every hit has a non-empty type, source and title: nothing is anonymous.
    for body in (jobs, companies, notes, mixed, applied):
        for group in body.values():
            for result in group:
                assert result["type"] and result["source"] and result["title"]


def test_search_is_a_case_insensitive_literal_substring_match(client):
    save_card(client, "Data Analyst Intern", "Velora Grid Systems SE")

    assert [r["type"] for r in hits(client, "ANALYST INT")["results"] if r["type"] == "job"] == ["job"]
    # Characters meaningful to SQL LIKE or regular expressions are literal text.
    assert hits(client, "%")["results"] == []
    assert hits(client, "Data.*Intern")["results"] == []
    assert hits(client, "Data' OR '1'='1")["results"] == []


def test_deleted_jobs_keep_application_and_event_hits_marked_card_missing(client):
    removed = save_card(client, "Role that will be deleted", "Gone GmbH")
    kept = save_card(client, "Role that stays", "Stay GmbH")
    application = post_application(client, removed["card_key"])
    event = post_event(client, "Gespräch Gone GmbH", card_key=removed["card_key"])
    kept_application = post_application(client, kept["card_key"])
    assert client.delete(f"/posting/card/{removed['card_key']}").status_code == 204

    grouped = by_type(hits(client, "Gespräch"))
    assert [(r["target"]["id"], r["card_missing"]) for r in grouped["event"]] == [
        (event["event_id"], True)
    ]
    # Both applications are found by their recorded date/status text; only the one whose
    # job was deleted is flagged and titled "Deleted job".
    applications = by_type(hits(client, "Applied 2030"))["application"]
    flags = {r["target"]["id"]: (r["card_missing"], r["title"]) for r in applications}
    assert flags[kept_application["application_id"]] == (False, "Role that stays")
    assert flags[application["application_id"]] == (True, "Deleted job")
    # The job itself is gone from job/company results: search never recreates it.
    assert "job" not in by_type(hits(client, "Role that will be deleted"))

    # Opening the retained application is still possible and says the job is deleted.
    opened = client.get(f"/search/records/application/{application['application_id']}")
    assert opened.status_code == 200
    assert opened.json()["card_missing"] is True
    assert opened.json()["title"] == "Deleted job"


def test_search_records_open_home_facts_and_unknown_records_are_not_found(client):
    task = post_task(client, "Referenzen sammeln", "2030-06-10")
    event = post_event(client, "Vorstellungsgespräch", kind="interview")

    opened_task = client.get(f"/search/records/task/{task['task_id']}")
    opened_event = client.get(f"/search/records/event/{event['event_id']}")

    assert opened_task.status_code == 200
    assert opened_task.json()["type"] == "task"
    assert opened_task.json()["id"] == task["task_id"]
    assert opened_task.json()["title"] == "Referenzen sammeln"
    assert {"label": "Due date", "value": "2030-06-10"} in opened_task.json()["fields"]
    assert opened_event.status_code == 200
    assert opened_event.json()["title"] == "Vorstellungsgespräch"
    assert {"label": "Kind", "value": "interview"} in opened_event.json()["fields"]

    # Unknown, wrong-type and malformed identities are distinct, safe failures.
    missing = client.get(f"/search/records/task/{uuid4()}")
    wrong_type = client.get(f"/search/records/event/{task['task_id']}")
    assert (missing.status_code, missing.json()) == (404, {"detail": "search.not_found"})
    assert wrong_type.status_code == 404
    assert client.get("/search/records/task/not-a-uuid").status_code == 422
    assert client.get(f"/search/records/card/{uuid4()}").status_code == 422


# ----------------------------------------------------------- SR-EMPTY-BOUND


def test_empty_blank_or_oversized_queries_are_rejected_and_never_scan(client):
    save_card(client, "Anything", "Anything GmbH")

    for params in (
        {"q": ""},
        {"q": "   "},
        {"q": "x" * 201},
        {"q": "ok", "limit": 0},
        {"q": "ok", "limit": 51},
    ):
        response = client.get("/search", params=params)
        assert response.status_code == 422, params
        assert response.json() == INVALID, params
    # A missing query is the same safe contract, not a FastAPI field dump.
    missing = client.get("/search")
    assert (missing.status_code, missing.json()) == (422, INVALID)


def test_no_match_is_an_empty_success_distinct_from_a_storage_failure(client, database_path):
    save_card(client, "Working Student Data Analytics", "Velora Grid Systems SE")

    empty = search(client, "zzzz-no-such-text")

    assert empty.status_code == 200
    assert empty.json() == {"results": [], "has_more": False}

    # Unreadable stored payloads are a failure with a fixed safe code, never "no results".
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute("UPDATE posting_cards SET payload_json = ?", ("{not valid json",))
    broken = search(client, "Velora")

    assert broken.status_code == 503
    assert broken.json() == {"detail": "search.storage_unavailable"}
    assert "Velora" not in broken.text and str(database_path) not in broken.text


def test_search_before_any_data_exists_is_empty_and_creates_nothing(database_path, key_store):
    # A fresh install has no workspace tables; searching must not create any.
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        before = table_snapshot(database_path)
        response = search(client, "anything")
        after = table_snapshot(database_path)

    assert response.status_code == 200
    assert response.json() == {"results": [], "has_more": False}
    assert after == before
    assert not {name for name in after if name.startswith(("home_", "personal_", "match_"))}


def test_result_count_is_bounded_and_more_matches_are_reported(client):
    for number in range(8):
        post_task(client, f"Bewerbung vorbereiten {number}")

    default = hits(client, "Bewerbung vorbereiten")
    limited = hits(client, "Bewerbung vorbereiten", limit=3)
    exact = hits(client, "Bewerbung vorbereiten", limit=8)

    assert len(default["results"]) == 8 and default["has_more"] is False
    assert len(limited["results"]) == 3 and limited["has_more"] is True
    assert len(exact["results"]) == 8 and exact["has_more"] is False
    # Within a page every record appears once.
    assert len({r["target"]["id"] for r in limited["results"]}) == 3


# -------------------------------------------------------- SR-READONLY-SCOPE


def test_searching_changes_no_stored_data_and_records_no_activity(client, database_path):
    card = save_card(client, "Search target role", "Search GmbH", notes="searchable note")
    post_task(client, "Search target task")
    post_event(client, "Search target event")
    post_application(client, card["card_key"])
    activity_before = client.get("/home/activity", params={
        "from": "2000-01-01T00:00:00+00:00", "to": "2100-01-01T00:00:00+00:00",
    }).json()
    snapshot = table_snapshot(database_path)

    for query in ("Search", "target", "searchable", "zzz-nothing"):
        assert search(client, query).status_code == 200
    assert client.get(f"/search/records/task/{uuid4()}").status_code == 404
    assert client.get(f"/search/records/application/{card['card_key']}").status_code == 404

    assert table_snapshot(database_path) == snapshot
    activity_after = client.get("/home/activity", params={
        "from": "2000-01-01T00:00:00+00:00", "to": "2100-01-01T00:00:00+00:00",
    }).json()
    assert activity_after == activity_before
    assert Counter(event["kind"] for event in activity_after["events"]) == Counter(
        {"card_saved": 1, "application_recorded": 1, "event_recorded": 1}
    )


def test_search_never_returns_provider_settings_secrets_or_profile_goal_content(
    client, key_store
):
    save_card(client, "Neutral role", "Neutral GmbH")
    provider = client.post("/settings/ai/providers", json=make_create_ai_provider_request(
        display_name=PRIVATE_PROVIDER, api_key=SECRET,
    ))
    assert provider.status_code == 201, provider.text
    assert client.patch("/settings/user", json={"display_name": "Private Display Name"}).status_code == 200
    assert client.put("/profile", json={"expected_revision": 0, "evidence": [
        {"kind": "skill", "label": PRIVATE_PROFILE, "description": PRIVATE_PROFILE},
    ]}).status_code == 200
    assert client.put("/goal", json={"expected_revision": 0, "objective": PRIVATE_GOAL, "constraints": [
        {"kind": "location", "label": PRIVATE_GOAL, "importance": "required"},
    ]}).status_code == 200

    # None of these exist in any searched record, so each query is an empty success.
    for needle in (
        PRIVATE_PROFILE, PRIVATE_GOAL, PRIVATE_PROVIDER, SECRET, "Private Display Name",
        "openai", "PRIVATE",
    ):
        response = search(client, needle)
        assert response.status_code == 200, needle
        assert response.json() == {"results": [], "has_more": False}, needle
    # The seeded neutral job is still reachable, proving the empty answers are not a dead search.
    assert Counter(r["type"] for r in hits(client, "Neutral")["results"]) == Counter(
        {"job": 1, "company": 1}
    )


def test_search_responses_do_not_echo_provenance_or_raw_payload_fields(client):
    card = save_card(client, "Provenance check role", "Provenance GmbH")

    body = hits(client, "Provenance check")
    opened = client.get(f"/search/records/task/{uuid4()}")

    assert [r["target"]["id"] for r in body["results"]] == [card["card_key"]]
    result = body["results"][0]
    # Only the projected display fields exist; no payload, import or source internals.
    assert set(result) == {"type", "source", "title", "snippet", "target", "card_missing"}
    for forbidden in ("payload", "excerpts", "source_urls", "origin", "import_key", "schema_version"):
        assert forbidden not in str(body)
    assert opened.json() == {"detail": "search.not_found"}


def test_search_never_uses_models_or_the_network(client, monkeypatch):
    save_card(client, "Offline role", "Offline GmbH")
    task = post_task(client, "Offline task")

    def forbidden(*args, **kwargs):
        pytest.fail("Local search must not call a model, a provider or the network")

    monkeypatch.setattr("tracer.api.postings.OpenAI", forbidden)
    monkeypatch.setattr("socket.socket.connect", forbidden)

    # The job title, its company and the task each match once.
    assert Counter(r["type"] for r in hits(client, "Offline")["results"]) == Counter(
        {"job": 1, "company": 1, "task": 1}
    )
    assert client.get(f"/search/records/task/{task['task_id']}").status_code == 200


def test_card_updates_are_searchable_by_their_current_text(client):
    card = save_card(client, "Original title", "Original GmbH")
    edited = client.patch(
        f"/posting/card/{card['card_key']}",
        json=make_card_update_request(
            position_title="Renamed Position", company_name="Renamed GmbH", user_notes="Fresh note"
        ),
    )
    assert edited.status_code == 200, edited.text

    assert by_type(hits(client, "Renamed Position"))["job"][0]["target"]["id"] == card["card_key"]
    assert by_type(hits(client, "Renamed GmbH"))["company"][0]["target"]["id"] == card["card_key"]
    assert by_type(hits(client, "Fresh note"))["note"][0]["target"]["id"] == card["card_key"]
    assert "job" not in by_type(hits(client, "Original title"))
