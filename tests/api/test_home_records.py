"""Contract tests for the Home shared-facts API (tasks, events, applications, activity).

Expected values come from the approved decision D06397dc9 (data rules and acceptance),
goal acceptance 4 and the stage acceptance, written as literals. Nothing here is derived
from production counting or serialization code. Every test uses a temporary SQLite
database through TestClient(create_app(database_path=...)); no real database, credential
store, provider or model is touched.

Approved rules exercised here:
- Home reads never create tables; the first explicit write (or a Card write hook) may.
- Saving a Card never creates an application; only an explicit POST does.
- Every stable ActivityEvent counts once; task completion counts once per task.
- Deleting a Card never cascades; references are marked ``card_missing``.
- Zero / unknown / not recorded / failed load are different states.
"""

import json
import sqlite3
import time
from collections import Counter
from contextlib import closing
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.settings_store import SettingsStore

from tests.api.factories import make_card_update_request, make_posting_details


PRIVATE = "PRIVATE-TITLE-do-not-echo"
INVALID = {"detail": "home.invalid_request"}
WIDE_RANGE = {"from": "2000-01-01T00:00:00+00:00", "to": "2100-01-01T00:00:00+00:00"}
# Local day 2030-06-10 with the client-supplied half-open windows of the approved
# rules: 14 days for Upcoming and 7 days for interviews.
FIXED_WINDOW = {
    "today": "2030-06-10",
    "day_start": "2030-06-10T00:00:00+00:00",
    "day_end": "2030-06-11T00:00:00+00:00",
    "upcoming_end": "2030-06-24T00:00:00+00:00",
    "interviews_end": "2030-06-17T00:00:00+00:00",
}


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Home tests must not use credentials, AI clients or suppliers")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def database_path(tmp_path):
    return tmp_path / "tracer.sqlite3"


@pytest.fixture
def key_store():
    return Mock(spec=ApiKeyStore)


@pytest.fixture
def client(database_path, key_store):
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        yield client


# ------------------------------------------------------------------ helpers


def home_tables(database_path):
    with closing(sqlite3.connect(database_path)) as connection:
        names = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    return {name for name in names if name.startswith("home_")}


def now_window(*, shift=timedelta(0)):
    """A window around the real clock; completion timestamps are set by the server."""
    now = datetime.now(timezone.utc) + shift
    return {
        "today": now.date().isoformat(),
        "day_start": (now - timedelta(hours=1)).isoformat(),
        "day_end": (now + timedelta(hours=1)).isoformat(),
        "upcoming_end": (now + timedelta(days=14)).isoformat(),
        "interviews_end": (now + timedelta(days=7)).isoformat(),
    }


def get_overview(client, window=None):
    response = client.get("/home/overview", params=window or FIXED_WINDOW)
    assert response.status_code == 200, response.text
    return response.json()


def get_activity(client, params=None):
    response = client.get("/home/activity", params=params or WIDE_RANGE)
    assert response.status_code == 200, response.text
    return response.json()


def activity_kinds(client):
    return Counter(event["kind"] for event in get_activity(client)["events"])


def post_task(client, title="Write the cover letter", due_on=None, task_id=None):
    body = {"task_id": task_id or str(uuid4()), "title": title}
    if due_on is not None:
        body["due_on"] = due_on
    return client.post("/home/tasks", json=body)


def post_event(client, kind, starts_at, title="Interview with the data team", **extra):
    body = {"event_id": str(uuid4()), "kind": kind, "title": title, "starts_at": starts_at, **extra}
    return client.post("/home/events", json=body)


def post_application(client, card_key, application_id=None, applied_on="2030-06-09", **extra):
    body = {
        "application_id": application_id or str(uuid4()),
        "card_key": card_key,
        "applied_on": applied_on,
        **extra,
    }
    return client.post("/home/applications", json=body)


def save_card(client, title="Working Student Data Analytics"):
    """Save a Card through the real HTTP flow, which fires the Card activity hook."""
    imported = client.post(
        "/posting/import",
        json={"kind": "text", "text": "Posting text for the Home tests.", "source_url": None},
    )
    assert imported.status_code == 201
    posting = make_posting_details().model_dump(mode="json")
    posting["identity"]["position_title"]["value"] = title
    response = client.post(
        "/posting/card",
        json={
            "import_key": imported.json()["import_key"],
            "posting": posting,
            "posting_alias": None,
            "user_notes": None,
            "tags": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def ids(items, key):
    return {item[key] for item in items}


# ------------------------------------------------------------------ HB-EMPTY


def test_empty_database_reads_return_empty_structures_without_creating_tables(
    client, database_path
):
    overview = get_overview(client)
    activity = get_activity(client)

    assert overview["today"]["tasks"] == []
    assert overview["today"]["completed_count"] == 0
    assert overview["today"]["completed_tasks"] == []
    assert overview["today"]["events"] == []
    assert overview["upcoming"] == {"events": [], "tasks": []}
    assert overview["your_search"] == {"active": 0, "awaiting_reply": 0, "interviews": 0}
    assert overview["applications"] == []
    assert overview["recent_jobs"] == []
    assert overview["recent_activity"] == []
    assert overview["ai_usage"]["providers"] == []
    assert activity == {"events": [], "recording_started_at": None}
    assert home_tables(database_path) == set()


def test_corrupt_stored_home_data_is_a_load_failure_not_empty_data(client, database_path):
    assert post_task(client).status_code == 201
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute("UPDATE home_tasks SET payload_json = ?", ("{not valid json",))

    response = client.get("/home/overview", params=FIXED_WINDOW)

    assert response.status_code == 503
    assert response.json() == {"detail": "home.storage_unavailable"}


# ------------------------------------------------------------------- HB-TASK


def test_task_creation_is_idempotent_by_client_uuid_and_conflicts_on_other_content(client):
    task_id = str(uuid4())

    first = post_task(client, "Write the cover letter", "2030-06-10", task_id)
    replay = post_task(client, "Write the cover letter", "2030-06-10", task_id)
    conflict = post_task(client, "A different title", "2030-06-10", task_id)

    assert first.status_code == 201
    assert first.json()["task_id"] == task_id
    assert first.json()["title"] == "Write the cover letter"
    assert first.json()["due_on"] == "2030-06-10"
    assert first.json()["completed_at"] is None
    assert first.json()["created_at"] is not None
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "home.id_conflict"}

    tasks = get_overview(client)["today"]["tasks"]
    assert [task["task_id"] for task in tasks] == [task_id]
    assert tasks[0]["title"] == "Write the cover letter"
    # Creating a task is not a recorded workspace operation.
    assert get_activity(client) == {"events": [], "recording_started_at": None}


def test_task_completion_counts_once_even_after_reopen_and_complete_again(client):
    task_id = post_task(client, due_on=datetime.now(timezone.utc).date().isoformat()).json()[
        "task_id"
    ]
    window = now_window()

    completed = client.post(f"/home/tasks/{task_id}/complete")
    assert completed.status_code == 200
    first_completed_at = completed.json()["completed_at"]
    assert first_completed_at is not None
    overview = get_overview(client, window)
    assert overview["today"]["completed_count"] == 1
    assert ids(overview["today"]["completed_tasks"], "task_id") == {task_id}
    assert task_id not in ids(overview["today"]["tasks"], "task_id")
    assert activity_kinds(client)["task_completed"] == 1

    repeated = client.post(f"/home/tasks/{task_id}/complete")
    assert repeated.status_code == 200
    assert repeated.json()["completed_at"] == first_completed_at
    assert activity_kinds(client)["task_completed"] == 1

    reopened = client.post(f"/home/tasks/{task_id}/reopen")
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None
    overview = get_overview(client, window)
    assert overview["today"]["completed_count"] == 0
    assert task_id in ids(overview["today"]["tasks"], "task_id")
    # History survives the reopen.
    assert activity_kinds(client)["task_completed"] == 1

    completed_again = client.post(f"/home/tasks/{task_id}/complete")
    assert completed_again.status_code == 200
    assert completed_again.json()["completed_at"] is not None
    assert get_overview(client, window)["today"]["completed_count"] == 1
    assert activity_kinds(client)["task_completed"] == 1


def test_unknown_task_cannot_be_completed_or_reopened(client):
    missing = uuid4()

    for action in ("complete", "reopen"):
        response = client.post(f"/home/tasks/{missing}/{action}")

        assert response.status_code == 404
        assert response.json() == {"detail": "home.not_found"}


def test_completion_outside_the_today_window_is_not_counted_today(client):
    task_id = post_task(client).json()["task_id"]
    assert client.post(f"/home/tasks/{task_id}/complete").status_code == 200

    past_day = get_overview(client, now_window(shift=timedelta(days=-3)))
    current_day = get_overview(client, now_window())

    assert past_day["today"]["completed_count"] == 0
    assert past_day["today"]["completed_tasks"] == []
    assert current_day["today"]["completed_count"] == 1


def test_task_dates_decide_today_and_upcoming_placement(client):
    overdue = post_task(client, "Overdue", "2030-06-09").json()["task_id"]
    due_today = post_task(client, "Due today", "2030-06-10").json()["task_id"]
    undated = post_task(client, "No date").json()["task_id"]
    tomorrow = post_task(client, "Tomorrow", "2030-06-11").json()["task_id"]
    day_13 = post_task(client, "Day 13", "2030-06-23").json()["task_id"]
    day_14 = post_task(client, "Day 14", "2030-06-24").json()["task_id"]
    done_tomorrow = post_task(client, "Finished", "2030-06-12").json()["task_id"]
    assert client.post(f"/home/tasks/{done_tomorrow}/complete").status_code == 200

    overview = get_overview(client)

    # Today lists incomplete tasks that are due today, overdue or undated; future
    # tasks wait. Upcoming covers the 14 date facts [today, today + 14).
    assert ids(overview["today"]["tasks"], "task_id") == {overdue, due_today, undated}
    assert ids(overview["upcoming"]["tasks"], "task_id") == {due_today, tomorrow, day_13}
    assert day_14 not in ids(overview["upcoming"]["tasks"], "task_id")
    assert done_tomorrow not in ids(overview["upcoming"]["tasks"], "task_id")


# ------------------------------------------------------------------ HB-EVENT


def test_event_creation_and_adjustment_keep_upcoming_and_interview_counts_consistent(client):
    today_interview = post_event(client, "interview", "2030-06-10T09:00:00+00:00")
    later_interview = post_event(client, "interview", "2030-06-20T10:00:00+00:00")
    deadline = post_event(client, "deadline", "2030-06-12T12:00:00+00:00", title="Portal closes")
    assert {r.status_code for r in (today_interview, later_interview, deadline)} == {201}
    assert today_interview.json()["created_at"] is not None
    assert today_interview.json()["cancelled"] is False
    today_id = today_interview.json()["event_id"]
    later_id = later_interview.json()["event_id"]
    deadline_id = deadline.json()["event_id"]

    overview = get_overview(client)
    assert ids([item["event"] for item in overview["today"]["events"]], "event_id") == {today_id}
    assert ids([item["event"] for item in overview["upcoming"]["events"]], "event_id") == {
        today_id,
        later_id,
        deadline_id,
    }
    # Only interviews inside the seven-day window count; the deadline never does.
    assert overview["your_search"]["interviews"] == 1

    moved_in = client.patch(
        f"/home/events/{later_id}", json={"starts_at": "2030-06-14T10:00:00+00:00"}
    )
    assert moved_in.status_code == 200
    assert get_overview(client)["your_search"]["interviews"] == 2

    moved_out = client.patch(
        f"/home/events/{later_id}", json={"starts_at": "2030-07-01T10:00:00+00:00"}
    )
    assert moved_out.status_code == 200
    overview = get_overview(client)
    assert overview["your_search"]["interviews"] == 1
    assert later_id not in ids([item["event"] for item in overview["upcoming"]["events"]], "event_id")


def test_cancelled_events_are_not_counted_or_listed(client):
    interview = post_event(client, "interview", "2030-06-10T09:00:00+00:00").json()["event_id"]
    other = post_event(client, "other", "2030-06-11T09:00:00+00:00", title="Career fair")
    other_id = other.json()["event_id"]

    cancelled = client.patch(f"/home/events/{interview}", json={"cancelled": True})

    assert cancelled.status_code == 200
    assert cancelled.json()["cancelled"] is True
    overview = get_overview(client)
    assert overview["today"]["events"] == []
    assert ids([item["event"] for item in overview["upcoming"]["events"]], "event_id") == {other_id}
    assert overview["your_search"]["interviews"] == 0


def test_unchanged_event_patch_adds_no_activity_and_unknown_event_is_not_found(client):
    event_id = post_event(client, "deadline", "2030-06-12T12:00:00+00:00").json()["event_id"]
    assert activity_kinds(client) == Counter({"event_recorded": 1})

    unchanged = client.patch(f"/home/events/{event_id}", json={"title": "Interview with the data team"})
    assert unchanged.status_code == 200
    assert activity_kinds(client) == Counter({"event_recorded": 1})

    changed = client.patch(f"/home/events/{event_id}", json={"title": "Portal closes"})
    assert changed.status_code == 200
    assert changed.json()["title"] == "Portal closes"
    assert activity_kinds(client) == Counter({"event_recorded": 1, "event_adjusted": 1})

    missing = client.patch(f"/home/events/{uuid4()}", json={"title": "Whatever"})
    assert missing.status_code == 404
    assert missing.json() == {"detail": "home.not_found"}


def test_event_creation_replays_by_uuid_and_conflicts_on_other_content(client):
    event_id = str(uuid4())
    body = {
        "event_id": event_id,
        "kind": "interview",
        "title": "Interview with the data team",
        "starts_at": "2030-06-10T09:00:00+00:00",
    }

    first = client.post("/home/events", json=body)
    replay = client.post("/home/events", json=body)
    conflict = client.post("/home/events", json={**body, "kind": "deadline"})

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "home.id_conflict"}
    assert activity_kinds(client) == Counter({"event_recorded": 1})
    assert len(get_overview(client)["upcoming"]["events"]) == 1


# -------------------------------------------------------------------- HB-APP


def test_saving_a_card_creates_no_application_and_only_explicit_recording_counts(client):
    card = save_card(client)
    card_key = card["card_key"]

    overview = get_overview(client)
    assert overview["your_search"] == {"active": 0, "awaiting_reply": 0, "interviews": 0}
    assert overview["applications"] == []
    assert [job["card"]["card_key"] for job in overview["recent_jobs"]] == [card_key]
    assert overview["recent_jobs"][0]["application"] is None
    assert activity_kinds(client) == Counter({"card_saved": 1})

    recorded = post_application(client, card_key)

    assert recorded.status_code == 201
    assert recorded.json()["card_key"] == card_key
    assert recorded.json()["status"] == "applied"
    assert recorded.json()["applied_on"] == "2030-06-09"
    assert recorded.json()["created_at"] is not None
    assert recorded.json()["updated_at"] is not None
    overview = get_overview(client)
    assert overview["your_search"]["active"] == 1
    assert overview["your_search"]["awaiting_reply"] == 1
    assert [item["record"]["card_key"] for item in overview["applications"]] == [card_key]
    assert overview["recent_jobs"][0]["application"]["application_id"] == recorded.json()["application_id"]
    assert activity_kinds(client) == Counter({"card_saved": 1, "application_recorded": 1})


def test_only_cards_with_explicit_applications_are_counted(client):
    applied = save_card(client, "Applied role")["card_key"]
    save_card(client, "Only saved role")
    save_card(client, "Another saved role")

    assert post_application(client, applied).status_code == 201

    your_search = get_overview(client)["your_search"]
    assert your_search["active"] == 1
    assert your_search["awaiting_reply"] == 1


def test_application_recording_is_idempotent_and_one_per_card(client):
    card_key = save_card(client)["card_key"]
    application_id = str(uuid4())

    first = post_application(client, card_key, application_id)
    replay = post_application(client, card_key, application_id)
    second_for_card = post_application(client, card_key)
    conflict = post_application(client, card_key, application_id, applied_on="2030-06-01")

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert second_for_card.status_code == 409
    assert second_for_card.json() == {"detail": "home.application_exists"}
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "home.id_conflict"}
    overview = get_overview(client)
    assert len(overview["applications"]) == 1
    assert overview["your_search"]["active"] == 1
    assert activity_kinds(client)["application_recorded"] == 1


def test_application_for_an_unknown_card_is_not_found_and_writes_nothing(client):
    response = post_application(client, str(uuid4()))

    assert response.status_code == 404
    assert response.json() == {"detail": "home.card_not_found"}
    assert get_overview(client)["applications"] == []
    assert get_activity(client)["events"] == []


def test_status_changes_append_application_events_and_follow_the_approved_counts(
    client, database_path
):
    card_key = save_card(client)["card_key"]
    application_id = post_application(client, card_key).json()["application_id"]

    def statuses():
        with closing(sqlite3.connect(database_path)) as connection:
            rows = connection.execute(
                "SELECT payload_json FROM home_application_events "
                "WHERE application_id = ? ORDER BY rowid",
                (application_id,),
            ).fetchall()
        return [json.loads(row[0])["status"] for row in rows]

    assert statuses() == ["applied"]

    interviewing = client.patch(
        f"/home/applications/{application_id}", json={"status": "interviewing"}
    )
    assert interviewing.status_code == 200
    assert interviewing.json()["status"] == "interviewing"
    your_search = get_overview(client)["your_search"]
    assert your_search["active"] == 1
    assert your_search["awaiting_reply"] == 0
    assert statuses() == ["applied", "interviewing"]
    assert activity_kinds(client)["application_status_changed"] == 1

    unchanged = client.patch(
        f"/home/applications/{application_id}", json={"status": "interviewing"}
    )
    assert unchanged.status_code == 200
    assert statuses() == ["applied", "interviewing"]
    assert activity_kinds(client)["application_status_changed"] == 1

    offer = client.patch(f"/home/applications/{application_id}", json={"status": "offer"})
    assert offer.status_code == 200
    # A finished application is no longer part of the active search.
    assert get_overview(client)["your_search"] == {
        "active": 0,
        "awaiting_reply": 0,
        "interviews": 0,
    }
    assert statuses() == ["applied", "interviewing", "offer"]
    assert activity_kinds(client)["application_status_changed"] == 2


def test_unknown_application_status_change_is_not_found(client):
    response = client.patch(f"/home/applications/{uuid4()}", json={"status": "offer"})

    assert response.status_code == 404
    assert response.json() == {"detail": "home.not_found"}


# ---------------------------------------------------------------- HB-CARDDEL


def test_deleting_a_card_keeps_applications_and_history_and_marks_them_missing(client):
    removed = save_card(client, "Role that will be deleted")["card_key"]
    kept = save_card(client, "Role that stays")["card_key"]
    application_id = post_application(client, removed).json()["application_id"]
    event_id = post_event(
        client, "interview", "2030-06-12T09:00:00+00:00", card_key=removed
    ).json()["event_id"]
    before = get_overview(client)
    assert [item["card_missing"] for item in before["applications"]] == [False]

    assert client.delete(f"/posting/card/{removed}").status_code == 204

    overview = get_overview(client)
    # No cascade: the application and its reference survive and are flagged.
    assert [item["record"]["application_id"] for item in overview["applications"]] == [
        application_id
    ]
    assert [item["card_missing"] for item in overview["applications"]] == [True]
    assert overview["your_search"]["active"] == 1
    upcoming = {item["event"]["event_id"]: item for item in overview["upcoming"]["events"]}
    assert upcoming[event_id]["card_missing"] is True
    # Recent jobs only lists live Cards.
    assert [job["card"]["card_key"] for job in overview["recent_jobs"]] == [kept]
    # Recent activity retains the deleted Card's history, marked as missing.
    by_card = {}
    for item in overview["recent_activity"]:
        by_card.setdefault(item["event"]["card_key"], []).append(item)
    assert {item["event"]["kind"] for item in by_card[removed]} == {
        "card_saved",
        "application_recorded",
        "event_recorded",
    }
    assert all(item["card_missing"] is True for item in by_card[removed])
    assert all(item["card_missing"] is False for item in by_card[kept])
    assert activity_kinds(client) == Counter(
        {"card_saved": 2, "application_recorded": 1, "event_recorded": 1}
    )


def test_new_references_to_a_deleted_card_are_rejected(client):
    card_key = save_card(client)["card_key"]
    assert client.delete(f"/posting/card/{card_key}").status_code == 204

    event = post_event(client, "other", "2030-06-12T09:00:00+00:00", card_key=card_key)
    application = post_application(client, card_key)

    assert event.status_code == 404
    assert event.json() == {"detail": "home.card_not_found"}
    assert application.status_code == 404
    assert application.json() == {"detail": "home.card_not_found"}


# ------------------------------------------------------------- HB-CARDHOOK


def test_card_writes_record_one_activity_per_saved_or_substantive_update(client):
    card = save_card(client)
    card_key = card["card_key"]

    events = get_activity(client)["events"]
    assert [(event["kind"], event["card_key"]) for event in events] == [("card_saved", card_key)]

    first_edit = client.patch(
        f"/posting/card/{card_key}", json=make_card_update_request(user_notes="First note")
    )
    assert first_edit.status_code == 200
    assert activity_kinds(client) == Counter({"card_saved": 1, "card_updated": 1})

    unchanged = client.patch(
        f"/posting/card/{card_key}", json=make_card_update_request(user_notes="First note")
    )
    assert unchanged.status_code == 200
    assert unchanged.json() == first_edit.json()
    assert activity_kinds(client) == Counter({"card_saved": 1, "card_updated": 1})

    second_edit = client.patch(
        f"/posting/card/{card_key}", json=make_card_update_request(user_notes="Second note")
    )
    assert second_edit.status_code == 200
    assert activity_kinds(client) == Counter({"card_saved": 1, "card_updated": 2})


def test_rejected_or_missing_card_updates_record_no_activity(client):
    card_key = save_card(client)["card_key"]
    invalid = make_card_update_request(user_notes="Never saved")
    invalid["responsibilities"] = "not a list"

    assert client.patch(f"/posting/card/{card_key}", json=invalid).status_code == 422
    assert (
        client.patch(f"/posting/card/{uuid4()}", json=make_card_update_request()).status_code
        == 404
    )

    assert activity_kinds(client) == Counter({"card_saved": 1})


def test_activity_storage_failure_never_changes_the_card_response(client, database_path):
    # Occupy the activity table name with an incompatible table so inserts fail.
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute("CREATE TABLE home_activity_events (unrelated TEXT)")

    card = save_card(client)

    stored = client.get(f"/posting/card/{card['card_key']}")
    assert stored.status_code == 200
    assert stored.json() == card
    edited = client.patch(
        f"/posting/card/{card['card_key']}",
        json=make_card_update_request(user_notes="Saved despite activity failure"),
    )
    assert edited.status_code == 200
    assert edited.json()["user_notes"] == "Saved despite activity failure"
    assert client.get(f"/posting/card/{card['card_key']}").json() == edited.json()


# ---------------------------------------------------------------- HB-PERSIST


def test_records_read_the_same_after_the_app_is_rebuilt_on_the_same_database(
    database_path, key_store
):
    window = now_window()
    # The event must fall inside the queried window (day_end is now + 1h), otherwise
    # comparing overviews could not detect a lost schedule record after the restart.
    event_start = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    task_id = str(uuid4())
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as first:
        assert post_task(first, "Survives restart", "2030-06-10", task_id).status_code == 201
        assert first.post(f"/home/tasks/{task_id}/complete").status_code == 200
        card_key = save_card(first)["card_key"]
        application_id = post_application(first, card_key).json()["application_id"]
        assert (
            first.patch(
                f"/home/applications/{application_id}", json={"status": "interviewing"}
            ).status_code
            == 200
        )
        created_event = post_event(first, "interview", event_start, title="Survives restart interview")
        assert created_event.status_code == 201
        event_id = created_event.json()["event_id"]
        overview_before = get_overview(first, window)
        activity_before = get_activity(first)
        scheduled_before = [
            item["event"] for item in overview_before["today"]["events"]
            if item["event"]["event_id"] == event_id
        ]
        assert len(scheduled_before) == 1
        assert scheduled_before[0]["title"] == "Survives restart interview"
        assert scheduled_before[0]["kind"] == "interview"
        assert overview_before["your_search"]["interviews"] == 1

    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as second:
        overview_after = get_overview(second, window)
        assert overview_after == overview_before
        scheduled_after = [
            item["event"] for item in overview_after["today"]["events"]
            if item["event"]["event_id"] == event_id
        ]
        assert scheduled_after == scheduled_before
        assert get_activity(second) == activity_before
        # A lost response after restart can be reconciled with the same UUID, and a
        # repeated completion still does not add a second recorded operation.
        assert post_task(second, "Survives restart", "2030-06-10", task_id).status_code == 201
        assert second.post(f"/home/tasks/{task_id}/complete").status_code == 200
        assert get_activity(second) == activity_before


# ------------------------------------------------------------------ HB-VALID


@pytest.mark.parametrize(
    "request_args",
    [
        pytest.param(("post", "/home/tasks", {"json": {"task_id": "not-a-uuid", "title": PRIVATE}}), id="task-bad-uuid"),
        pytest.param(("post", "/home/tasks", {"json": {"task_id": str(uuid4()), "title": ""}}), id="task-empty-title"),
        pytest.param(("post", "/home/tasks", {"json": {"task_id": str(uuid4()), "title": PRIVATE * 20}}), id="task-title-too-long"),
        pytest.param(("post", "/home/tasks", {"json": {"task_id": str(uuid4()), "title": PRIVATE, "notes": PRIVATE}}), id="task-extra-field"),
        pytest.param(("post", "/home/tasks", {"json": {"task_id": str(uuid4()), "title": PRIVATE, "due_on": "next week"}}), id="task-bad-date"),
        pytest.param(("post", f"/home/tasks/{PRIVATE}/complete", {}), id="complete-bad-path-id"),
        pytest.param(("post", "/home/events", {"json": {"event_id": str(uuid4()), "kind": "interview", "title": PRIVATE, "starts_at": "2030-06-10T09:00:00"}}), id="event-naive-time"),
        pytest.param(("post", "/home/events", {"json": {"event_id": str(uuid4()), "kind": "interview", "title": PRIVATE, "starts_at": "2030-06-10T09:00:00+00:00", "ends_at": "2030-06-10T08:00:00+00:00"}}), id="event-end-before-start"),
        pytest.param(("post", "/home/events", {"json": {"event_id": str(uuid4()), "kind": "party", "title": PRIVATE, "starts_at": "2030-06-10T09:00:00+00:00"}}), id="event-bad-kind"),
        pytest.param(("post", "/home/applications", {"json": {"application_id": str(uuid4()), "card_key": str(uuid4()), "applied_on": "2030-06-09", "status": PRIVATE}}), id="application-bad-status"),
        pytest.param(("post", "/home/applications", {"json": {"application_id": str(uuid4()), "card_key": PRIVATE, "applied_on": "2030-06-09"}}), id="application-bad-card-key"),
        pytest.param(("post", "/home/applications", {"json": {"application_id": str(uuid4()), "card_key": str(uuid4()), "applied_on": PRIVATE}}), id="application-bad-date"),
        pytest.param(("get", "/home/overview", {"params": {"today": PRIVATE}}), id="overview-missing-and-bad-params"),
        pytest.param(("get", "/home/overview", {"params": {**FIXED_WINDOW, "day_start": "2030-06-10T00:00:00"}}), id="overview-naive-window"),
        pytest.param(("get", "/home/overview", {"params": {**FIXED_WINDOW, "day_end": "2030-06-09T00:00:00+00:00"}}), id="overview-reversed-window"),
        pytest.param(("get", "/home/activity", {"params": {"from": WIDE_RANGE["to"], "to": WIDE_RANGE["from"]}}), id="activity-reversed-range"),
        pytest.param(("get", "/home/activity", {"params": {"from": PRIVATE, "to": WIDE_RANGE["to"]}}), id="activity-bad-time"),
    ],
)
def test_invalid_requests_return_a_fixed_detail_without_echoing_or_writing(
    client, database_path, request_args
):
    method, path, kwargs = request_args

    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == 422
    assert response.json() == INVALID
    assert PRIVATE not in response.text
    assert home_tables(database_path) == set()


def test_invalid_event_adjustments_return_the_fixed_detail_and_keep_the_event(client):
    event_id = post_event(client, "interview", "2030-06-10T09:00:00+00:00").json()["event_id"]

    for body in (
        {"title": None},
        {"starts_at": None},
        {"starts_at": "2030-06-10T09:00:00"},
        {"ends_at": "2030-06-10T08:00:00+00:00"},
        {"title": PRIVATE, "unknown_field": PRIVATE},
    ):
        response = client.patch(f"/home/events/{event_id}", json=body)

        assert response.status_code == 422, body
        assert response.json() == INVALID
        assert PRIVATE not in response.text

    events = get_overview(client)["today"]["events"]
    assert [item["event"]["title"] for item in events] == ["Interview with the data team"]
    assert activity_kinds(client) == Counter({"event_recorded": 1})


# ------------------------------------------------------------------ HB-USAGE


def test_ai_usage_distinguishes_budget_states_and_marks_usage_not_recorded(
    database_path, key_store
):
    not_set = AIProviderSettings(
        provider_key=uuid4(), provider=AIProvider.OPENAI, display_name="no_budget_provider"
    )
    zero = AIProviderSettings(
        provider_key=uuid4(),
        provider=AIProvider.DEEPSEEK,
        display_name="zero_budget_provider",
        monthly_budget_usd=0.0,
    )
    funded = AIProviderSettings(
        provider_key=uuid4(),
        provider=AIProvider.OPENAI,
        display_name="funded_provider",
        monthly_budget_usd=7.5,
    )
    SettingsStore(database_path).save(
        AppSettings(
            user=UserSettings(display_name="test_name"),
            ai=AISettings(providers=(not_set, zero, funded), tasks=()),
        )
    )

    def stored_settings():
        with closing(sqlite3.connect(database_path)) as connection:
            return connection.execute("SELECT * FROM app_settings").fetchall()

    before = stored_settings()
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        response = client.get("/home/overview", params=FIXED_WINDOW)

    assert response.status_code == 200
    usage = response.json()["ai_usage"]
    assert usage["status"] == "not_recorded"
    assert usage["tokens"] is None
    assert usage["estimated_cost_usd"] is None
    providers = {item["provider_key"]: item for item in usage["providers"]}
    assert set(providers) == {str(not_set.provider_key), str(zero.provider_key), str(funded.provider_key)}
    assert providers[str(not_set.provider_key)]["monthly_budget_usd"] is None
    assert providers[str(not_set.provider_key)]["budget_status"] == "not_set"
    assert providers[str(zero.provider_key)]["monthly_budget_usd"] == 0
    assert providers[str(zero.provider_key)]["budget_status"] == "zero"
    assert providers[str(funded.provider_key)]["monthly_budget_usd"] == 7.5
    assert providers[str(funded.provider_key)]["budget_status"] == "set"
    assert providers[str(funded.provider_key)]["display_name"] == "funded_provider"
    assert "api_key" not in response.text
    # Reading usage never rewrites settings, opens credentials or creates Home tables.
    assert stored_settings() == before
    assert key_store.mock_calls == []
    assert home_tables(database_path) == set()


# --------------------------------------------------------------- HB-ACTIVITY


def test_activity_returns_only_the_requested_range_and_the_earliest_recording_start(client):
    task_id = post_task(client).json()["task_id"]
    time.sleep(0.02)
    assert client.post(f"/home/tasks/{task_id}/complete").status_code == 200
    time.sleep(0.02)
    event_id = post_event(client, "deadline", "2030-06-12T12:00:00+00:00").json()["event_id"]
    time.sleep(0.02)
    assert client.patch(f"/home/events/{event_id}", json={"title": "Portal closes"}).status_code == 200

    wide = get_activity(client)
    ordered = sorted(
        wide["events"], key=lambda event: datetime.fromisoformat(event["occurred_at"])
    )
    assert [event["kind"] for event in ordered] == [
        "task_completed",
        "event_recorded",
        "event_adjusted",
    ]
    first, second, third = (datetime.fromisoformat(event["occurred_at"]) for event in ordered)
    assert first < second < third
    assert datetime.fromisoformat(wide["recording_started_at"]) == first

    middle = get_activity(
        client,
        {
            "from": (first + (second - first) / 2).isoformat(),
            "to": (second + (third - second) / 2).isoformat(),
        },
    )
    assert [event["kind"] for event in middle["events"]] == ["event_recorded"]
    # The start is the first operation ever recorded, not the first in the range.
    assert datetime.fromisoformat(middle["recording_started_at"]) == first

    before_all = get_activity(
        client,
        {
            "from": (first - timedelta(days=2)).isoformat(),
            "to": (first - timedelta(days=1)).isoformat(),
        },
    )
    after_all = get_activity(
        client,
        {
            "from": (third + timedelta(days=1)).isoformat(),
            "to": (third + timedelta(days=2)).isoformat(),
        },
    )
    assert before_all["events"] == []
    assert after_all["events"] == []
    assert datetime.fromisoformat(before_all["recording_started_at"]) == first
    assert datetime.fromisoformat(after_all["recording_started_at"]) == first


def test_existing_cards_are_not_backfilled_into_activity(database_path, key_store):
    legacy = PostingCard(import_key=uuid4(), posting=make_posting_details())
    PostingCardStore(database_path).add(legacy)

    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        overview = get_overview(client)
        activity = get_activity(client)

    # The Card is visible as a recent job but no history is invented for it.
    assert [job["card"]["card_key"] for job in overview["recent_jobs"]] == [str(legacy.card_key)]
    assert overview["recent_activity"] == []
    assert activity == {"events": [], "recording_started_at": None}
    assert home_tables(database_path) == set()
