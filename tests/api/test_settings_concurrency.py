import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.settings_store import SettingsStore

from tests.api.factories import make_create_ai_provider_request


class ObservedLock:
    """Use a real mutex and signal contention without timing-dependent sleeps."""

    def __init__(self):
        self.mutex = Lock()
        self.counter_lock = Lock()
        self.attempts = 0
        self.second_attempt = Event()

    def __enter__(self):
        with self.counter_lock:
            self.attempts += 1
            if self.attempts == 2:
                self.second_attempt.set()
        if not self.mutex.acquire(timeout=5):
            raise TimeoutError("Test settings lock was not released")
        return self

    def __exit__(self, *args):
        self.mutex.release()


@pytest.fixture
def locked_client(tmp_path, monkeypatch):
    def fail_system_access():
        pytest.fail("Concurrency tests must not access native credentials")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_system_access)
    lock = ObservedLock()
    monkeypatch.setattr("tracer.api.settings.Lock", lambda: lock)
    key_store = Mock(spec=ApiKeyStore)
    key_store.delete.return_value = True
    app = create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, lock, key_store


def send_write(client, operation, name):
    if operation == "create":
        return client.post("/settings/ai/providers", json=make_create_ai_provider_request(
            display_name=name,
        ))
    return client.patch("/settings/user", json={"display_name": name})


@pytest.mark.parametrize(("first", "second"), [
    ("create", "update"), ("update", "create"), ("create", "create"),
])
def test_shared_lock_protects_the_entire_read_modify_save(
    locked_client, monkeypatch, first, second
):
    client, lock, key_store = locked_client
    first_read = Event()
    release_read = Event()
    counter_lock = Lock()
    reads = 0
    original_get = SettingsStore.get

    def pause_first_read(store):
        nonlocal reads
        snapshot = original_get(store)
        with counter_lock:
            reads += 1
            is_first = reads == 1
        if is_first:
            first_read.set()
            if not release_read.wait(timeout=5):
                raise TimeoutError("Test did not release the first settings read")
        return snapshot

    monkeypatch.setattr(SettingsStore, "get", pause_first_read)
    with ThreadPoolExecutor(max_workers=3) as pool:
        first_request = pool.submit(send_write, client, first, "test_first")
        try:
            assert first_read.wait(timeout=5)
            second_request = pool.submit(send_write, client, second, "test_second")
            assert lock.second_attempt.wait(timeout=5)
            # The second writer must wait before reading, not just before saving.
            assert reads == 1
            assert not second_request.done()
            # GET is not blocked; it still sees the previously committed snapshot.
            read_response = pool.submit(client.get, "/settings").result(timeout=5)
            assert read_response.status_code == 200
            assert read_response.json() == {
                "user": {"display_name": None}, "ai": {"providers": [], "tasks": []},
            }
        finally:
            release_read.set()
        first_response = first_request.result(timeout=5)
        second_response = second_request.result(timeout=5)

    assert first_response.status_code == (201 if first == "create" else 200)
    assert second_response.status_code == (201 if second == "create" else 200)
    assert not lock.mutex.locked()
    saved = client.get("/settings").json()
    expected_providers = [response.json() for operation, response in (
        (first, first_response), (second, second_response)
    ) if operation == "create"]
    assert saved["ai"] == {"providers": expected_providers, "tasks": []}
    expected_name = ("test_first" if first == "update" else
                     "test_second" if second == "update" else None)
    assert saved["user"] == {"display_name": expected_name}
    assert key_store.save.call_count == len(expected_providers)
    assert len({provider["provider_key"] for provider in expected_providers}) == len(expected_providers)


@pytest.mark.parametrize("operation", ["create", "update"])
def test_failed_write_releases_lock_for_the_next_request(locked_client, monkeypatch, operation):
    client, lock, key_store = locked_client
    original_save = SettingsStore.save

    def fail_save(store, settings):
        raise sqlite3.OperationalError("test_save_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)
    failed = send_write(client, operation, "test_failed")
    assert failed.status_code == 500
    assert not lock.mutex.locked()
    if operation == "create":
        key_store.delete.assert_called_once()

    monkeypatch.setattr(SettingsStore, "save", original_save)
    succeeded = client.patch("/settings/user", json={"display_name": "test_recovered"})
    assert succeeded.status_code == 200
    assert succeeded.json() == {
        "user": {"display_name": "test_recovered"}, "ai": {"providers": [], "tasks": []},
    }


def test_provider_patch_and_user_update_share_the_lock(locked_client, monkeypatch):
    client, lock, key_store = locked_client
    created = client.post("/settings/ai/providers", json=make_create_ai_provider_request(
        provider="openai", display_name="test_openai",
    ))
    assert created.status_code == 201
    provider_key = created.json()["provider_key"]

    # Observe only the upcoming contenders, not the completed seed POST.
    assert not lock.mutex.locked()
    with lock.counter_lock:
        lock.attempts = 0
        lock.second_attempt.clear()

    first_read = Event()
    release_read = Event()
    counter_lock = Lock()
    reads = 0
    original_get = SettingsStore.get

    def pause_first_read(store):
        nonlocal reads
        snapshot = original_get(store)
        with counter_lock:
            reads += 1
            is_first = reads == 1
        if is_first:
            first_read.set()
            if not release_read.wait(timeout=5):
                raise TimeoutError("Test did not release the first settings read")
        return snapshot

    monkeypatch.setattr(SettingsStore, "get", pause_first_read)
    with ThreadPoolExecutor(max_workers=3) as pool:
        first_request = pool.submit(
            client.patch, f"/settings/ai/providers/{provider_key}",
            json={"display_name": "test_renamed", "monthly_budget_usd": 5},
        )
        try:
            assert first_read.wait(timeout=5)
            with lock.counter_lock:
                assert lock.attempts == 1
                assert not lock.second_attempt.is_set()
            second_request = pool.submit(
                client.patch, "/settings/user", json={"display_name": "test_user"}
            )
            assert lock.second_attempt.wait(timeout=5)
            with lock.counter_lock:
                assert lock.attempts == 2
            # The second writer must wait before reading, not just before saving.
            with counter_lock:
                assert reads == 1
            assert not second_request.done()
        finally:
            release_read.set()
        first_response = first_request.result(timeout=5)
        second_response = second_request.result(timeout=5)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert not lock.mutex.locked()
    saved = client.get("/settings").json()
    assert saved["user"] == {"display_name": "test_user"}
    assert saved["ai"]["providers"][0]["display_name"] == "test_renamed"
    assert saved["ai"]["providers"][0]["provider_key"] == provider_key


def test_failed_provider_patch_releases_lock(locked_client, monkeypatch):
    client, lock, key_store = locked_client
    created = client.post("/settings/ai/providers", json=make_create_ai_provider_request(
        provider="openai", display_name="test_openai",
    ))
    provider_key = created.json()["provider_key"]
    original_save = SettingsStore.save

    def fail_save(store, settings):
        raise sqlite3.OperationalError("test_save_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)
    failed = client.patch(
        f"/settings/ai/providers/{provider_key}",
        json={"display_name": "test_renamed", "monthly_budget_usd": 5},
    )
    assert failed.status_code == 500
    assert not lock.mutex.locked()

    monkeypatch.setattr(SettingsStore, "save", original_save)
    succeeded = client.patch("/settings/user", json={"display_name": "test_recovered"})
    assert succeeded.status_code == 200
    assert succeeded.json()["user"] == {"display_name": "test_recovered"}
