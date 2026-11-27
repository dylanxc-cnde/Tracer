import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.api.factories import make_card_update_request, make_posting_details
from tracer.api.app import create_app
from tracer.postings.models.posting_card import PostingCard
from tracer.postings.models.posting_import import PostingImportRequest
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.postings.stores.posting_import_request_store import (
    PostingImportRequestStore,
)


SUBMITTED_LINK = "https://example.com/jobs/transport"
RAW_TEXT = "Synthetic posting containing private source text."
URL_SOURCE = {"kind": "url", "url": SUBMITTED_LINK}
TEXT_SOURCE = {"kind": "text", "text": RAW_TEXT}


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Source checks must not use credentials or AI clients")

    monkeypatch.setattr(
        "tracer.settings.api_key_store._create_system_backend", fail_access
    )
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def database_path(tmp_path):
    return tmp_path / "tracer.sqlite3"


@pytest.fixture
def client(database_path):
    with TestClient(create_app(database_path=database_path)) as api:
        yield api


def save_card(client, source):
    imported = client.post("/posting/import", json=source)
    assert imported.status_code == 201
    import_key = imported.json()["import_key"]
    card = client.post(
        "/posting/card",
        json={
            "import_key": import_key,
            "posting": make_posting_details().model_dump(mode="json"),
        },
    )
    assert card.status_code == 201
    return f"/posting/card/{card.json()['card_key']}", import_key


def check_request(result="listed"):
    return {"check_id": str(uuid4()), "result": result}


@pytest.mark.parametrize(
    "source",
    [URL_SOURCE, {**TEXT_SOURCE, "source_url": SUBMITTED_LINK}],
    ids=["submitted-link", "text-with-submitted-link"],
)
def test_records_manual_checks_newest_first(client, source):
    card_path, _ = save_card(client, source)
    checks_path = f"{card_path}/source-checks"
    empty = client.get(checks_path)
    assert empty.status_code == 200
    assert empty.json() == []
    current = client.get(card_path).json()
    original = client.get(f"{card_path}/original").json()

    checks = []
    for result in ("listed", "not_listed", "unable_to_confirm"):
        body = check_request(result)
        response = client.post(checks_path, json=body)
        assert response.status_code == 201
        check = response.json()
        assert check == {**body, "recorded_at": check["recorded_at"]}
        assert check["recorded_at"].endswith("Z")
        checks.append(check)

    assert client.get(checks_path).json() == checks[::-1]
    assert client.get(card_path).json() == current
    assert client.get(f"{card_path}/original").json() == original


def test_edited_card_link_does_not_enable_source_checks(client):
    card_path, _ = save_card(client, TEXT_SOURCE)
    assert (
        client.patch(
            card_path,
            json=make_card_update_request(canonical_posting_url=SUBMITTED_LINK),
        ).status_code
        == 200
    )

    checks_path = f"{card_path}/source-checks"
    response = client.post(checks_path, json=check_request())

    assert response.status_code == 409
    assert response.json() == {"detail": "posting.source_check_unavailable"}
    assert client.get(checks_path).json() == []


def test_deleted_import_retains_checks_and_allows_matching_replay(
    client, database_path
):
    card_path, import_key = save_card(
        client, {**TEXT_SOURCE, "source_url": SUBMITTED_LINK}
    )
    checks_path = f"{card_path}/source-checks"
    body = check_request()
    created = client.post(checks_path, json=body)
    assert created.status_code == 201
    assert client.delete(f"/posting/import/{import_key}").status_code == 204
    assert client.get(f"{card_path}/source-receipt").json() is None

    history = client.get(checks_path)
    assert history.status_code == 200
    assert history.json() == [created.json()]
    assert RAW_TEXT not in history.text
    assert SUBMITTED_LINK not in history.text
    replay = client.post(checks_path, json=body)
    assert replay.status_code == 200
    assert replay.json() == created.json()
    conflict = client.post(checks_path, json={**body, "result": "not_listed"})
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "posting.source_check_conflict"}
    unavailable = client.post(checks_path, json=check_request())
    assert unavailable.status_code == 409
    assert unavailable.json() == {"detail": "posting.source_check_unavailable"}

    with closing(sqlite3.connect(database_path)) as database:
        columns = {
            row[1]
            for row in database.execute("PRAGMA table_info(posting_source_checks)")
        }
        assert columns == {"check_id", "card_key", "recorded_at", "result"}
        assert database.execute(
            "SELECT COUNT(*) FROM posting_source_checks"
        ).fetchone() == (1,)


def test_reusing_a_check_id_for_another_card_conflicts(client):
    first, _ = save_card(client, URL_SOURCE)
    second, _ = save_card(client, URL_SOURCE)
    body = check_request()
    assert client.post(f"{first}/source-checks", json=body).status_code == 201

    response = client.post(f"{second}/source-checks", json=body)

    assert response.status_code == 409
    assert response.json() == {"detail": "posting.source_check_conflict"}
    assert client.get(f"{second}/source-checks").json() == []


def test_deleting_card_removes_checks_but_preserves_home_application(
    client, database_path
):
    card_path, import_key = save_card(client, URL_SOURCE)
    card_key = card_path.rsplit("/", 1)[1]
    checks_path = f"{card_path}/source-checks"
    body = check_request()
    assert client.post(checks_path, json=body).status_code == 201
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

    assert client.delete(card_path).status_code == 204
    missing = client.get(checks_path)
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Posting card not found"}
    assert client.post(checks_path, json=body).status_code == 404
    assert client.get(f"/posting/import/{import_key}").status_code == 200
    with closing(sqlite3.connect(database_path)) as database:
        assert database.execute(
            "SELECT COUNT(*) FROM posting_source_checks"
        ).fetchone() == (0,)
        assert database.execute(
            "SELECT card_key FROM home_applications WHERE application_id = ?",
            (application_id,),
        ).fetchone() == (card_key,)


def test_existing_database_accepts_concurrent_identical_checks(database_path):
    receipt = PostingImportRequest(import_key=uuid4(), source=URL_SOURCE)
    PostingImportRequestStore(database_path).add(receipt)
    card = PostingCard(import_key=receipt.import_key, posting=make_posting_details())
    PostingCardStore(database_path).add(card)
    checks_path = f"/posting/card/{card.card_key}/source-checks"
    body = check_request()
    start = Barrier(2)

    with (
        TestClient(create_app(database_path=database_path)) as client,
        ThreadPoolExecutor(2) as workers,
    ):

        def submit():
            start.wait(timeout=5)
            return client.post(checks_path, json=body)

        first = workers.submit(submit)
        second = workers.submit(submit)
        responses = [first.result(timeout=10), second.result(timeout=10)]

        assert sorted(response.status_code for response in responses) == [200, 201]
        assert responses[0].json() == responses[1].json()
        assert client.get(checks_path).json() == [responses[0].json()]


def test_source_check_requires_an_explicit_valid_result(client):
    card_path, _ = save_card(client, URL_SOURCE)
    checks_path = f"{card_path}/source-checks"
    response = client.post(checks_path, json=check_request("applied"))

    assert response.status_code == 422
    assert client.get(checks_path).json() == []
