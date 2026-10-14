import sqlite3
from unittest.mock import Mock, call
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.errors.settings_errors import ApiKeyStoreError
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.settings_store import SettingsStore


OPENAI_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
DEEPSEEK_KEY = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
UNKNOWN_KEY = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Provider management tests must not use real credentials or AI clients")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def credentials():
    return {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}


@pytest.fixture
def key_store(credentials):
    store = Mock(spec=ApiKeyStore)
    store.get.side_effect = lambda key: credentials.get(key)
    store.save.side_effect = lambda key, secret: credentials.update({key: secret})
    store.delete.side_effect = lambda key: credentials.pop(key, None) is not None
    return store


@pytest.fixture
def saved_settings(tmp_path):
    settings = AppSettings(
        user=UserSettings(display_name="test_first_name test_last_name"),
        ai=AISettings(
            providers=(
                AIProviderSettings(
                    provider_key=OPENAI_KEY,
                    provider=AIProvider.OPENAI,
                    display_name="test_openai",
                    monthly_budget_usd=10,
                ),
                AIProviderSettings(
                    provider_key=DEEPSEEK_KEY,
                    provider=AIProvider.DEEPSEEK,
                    display_name="test_deepseek",
                    monthly_budget_usd=None,
                ),
            ),
            tasks=(
                AITaskSettings(
                    task="test_search", provider_key=OPENAI_KEY, model="test_model"
                ),
            ),
        ),
    )
    SettingsStore(tmp_path / "test.sqlite3").save(settings)
    return settings


@pytest.fixture
def client(tmp_path, key_store):
    app = create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize("budget", [None, 0, 12.5])
def test_patch_provider_updates_public_fields_and_preserves_everything_else(
    client, key_store, saved_settings, budget
):
    response = client.patch(
        f"/settings/ai/providers/{OPENAI_KEY}",
        json={"display_name": "  test_updated  ", "monthly_budget_usd": budget},
    )

    assert response.status_code == 200
    assert response.json() == {
        "provider_key": str(OPENAI_KEY),
        "provider": "openai",
        "display_name": "test_updated",
        "monthly_budget_usd": budget,
    }
    # A public-field edit must never touch credential storage.
    assert key_store.mock_calls == []

    saved = client.get("/settings").json()
    assert saved["user"] == {"display_name": "test_first_name test_last_name"}
    assert saved["ai"]["providers"] == [
        {
            "provider_key": str(OPENAI_KEY),
            "provider": "openai",
            "display_name": "test_updated",
            "monthly_budget_usd": budget,
        },
        {
            "provider_key": str(DEEPSEEK_KEY),
            "provider": "deepseek",
            "display_name": "test_deepseek",
            "monthly_budget_usd": None,
        },
    ]
    assert saved["ai"]["tasks"] == [
        {"task": "test_search", "provider_key": str(OPENAI_KEY), "model": "test_model"},
    ]


def test_patch_provider_persists_across_app_instances(client, key_store, saved_settings, tmp_path):
    response = client.patch(
        f"/settings/ai/providers/{OPENAI_KEY}",
        json={"display_name": "test_updated", "monthly_budget_usd": 7.5},
    )
    assert response.status_code == 200

    with TestClient(
        create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    ) as reopened:
        saved = reopened.get("/settings").json()

    assert saved["ai"]["providers"][0] == {
        "provider_key": str(OPENAI_KEY),
        "provider": "openai",
        "display_name": "test_updated",
        "monthly_budget_usd": 7.5,
    }


def test_patch_unknown_provider_returns_404(client, key_store):
    response = client.patch(
        f"/settings/ai/providers/{UNKNOWN_KEY}",
        json={"display_name": "test_updated", "monthly_budget_usd": 5},
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": {
            "code": "settings.ai_provider_not_found",
            "message": "Provider not found.",
            "context": {},
        }
    }
    assert key_store.mock_calls == []


@pytest.mark.parametrize("changes", [
    {"display_name": " "},
    {"monthly_budget_usd": -1},
    {"monthly_budget_usd": "10"},
    {"monthly_budget_usd": True},
    {"display_name": "test_updated", "monthly_budget_usd": 5, "provider": "openai"},
    {"display_name": "test_updated", "monthly_budget_usd": 5, "provider_key": str(OPENAI_KEY)},
])
def test_patch_invalid_body_is_sanitized_without_writes(
    client, key_store, saved_settings, tmp_path, changes
):
    body = {"display_name": "test_updated", "monthly_budget_usd": 5}
    body.update(changes)
    response = client.patch(f"/settings/ai/providers/{OPENAI_KEY}", json=body)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI settings."}
    assert key_store.mock_calls == []
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_patch_missing_field_is_rejected(client, key_store, saved_settings, tmp_path):
    response = client.patch(
        f"/settings/ai/providers/{OPENAI_KEY}", json={"display_name": "test_updated"}
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI settings."}
    assert key_store.mock_calls == []
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_patch_invalid_uuid_path_is_sanitized(client, key_store):
    response = client.patch(
        "/settings/ai/providers/not-a-uuid",
        json={"display_name": "test_updated", "monthly_budget_usd": 5},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI settings."}
    assert key_store.mock_calls == []


def test_replace_key_writes_only_target_uuid_without_sqlite_change(
    client, key_store, credentials, saved_settings, tmp_path
):
    response = client.put(
        f"/settings/ai/providers/{OPENAI_KEY}/api-key",
        json={"api_key": "  test_new_key  "},
    )

    assert response.status_code == 204
    assert response.text == ""
    key_store.get.assert_called_once_with(OPENAI_KEY)
    key_store.save.assert_called_once_with(OPENAI_KEY, "  test_new_key  ")
    key_store.delete.assert_not_called()
    assert credentials == {
        OPENAI_KEY: "  test_new_key  ",
        DEEPSEEK_KEY: "test_deepseek_key",
    }
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings
    assert "test_new_key" not in client.get("/settings").text


def test_replace_key_unknown_provider_returns_404(client, key_store):
    response = client.put(
        f"/settings/ai/providers/{UNKNOWN_KEY}/api-key", json={"api_key": "test_new_key"}
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "settings.ai_provider_not_found"
    assert key_store.mock_calls == []


@pytest.mark.parametrize("body", [
    {"api_key": " "},
    {"api_key": "  \t "},
    {"api_key": "test_new_key", "provider": "openai"},
])
def test_replace_key_invalid_body_is_sanitized(client, key_store, body):
    response = client.put(f"/settings/ai/providers/{OPENAI_KEY}/api-key", json=body)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI settings."}
    assert key_store.mock_calls == []


def test_replace_key_get_failure_reports_safe_operation_error(
    client, key_store, saved_settings, tmp_path
):
    key_store.get.side_effect = ApiKeyStoreError("test_get_failure")

    response = client.put(
        f"/settings/ai/providers/{OPENAI_KEY}/api-key", json={"api_key": "test_new_key"}
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_operation_failed"
    assert "test_get_failure" not in response.text
    key_store.save.assert_not_called()
    key_store.delete.assert_not_called()
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_replace_key_save_failure_with_verified_compensation(
    client, key_store, credentials, saved_settings, tmp_path
):
    states_after_write = []

    def write_then_fail_once(key, secret):
        credentials[key] = secret
        states_after_write.append(dict(credentials))
        if len(states_after_write) == 1:
            raise ApiKeyStoreError("test_new_key test_save_failure")

    key_store.save.side_effect = write_then_fail_once

    response = client.put(
        f"/settings/ai/providers/{OPENAI_KEY}/api-key", json={"api_key": "test_new_key"}
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_operation_failed"
    assert "test_save_failure" not in response.text
    assert "test_new_key" not in response.text
    assert states_after_write == [
        {OPENAI_KEY: "test_new_key", DEEPSEEK_KEY: "test_deepseek_key"},
        {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"},
    ]
    assert credentials == {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert key_store.mock_calls == [
        call.get(OPENAI_KEY), call.save(OPENAI_KEY, "test_new_key"),
        call.save(OPENAI_KEY, "test_openai_key"), call.get(OPENAI_KEY),
    ]
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


@pytest.mark.parametrize("restore_failure", ["raises", "silent_noop"])
def test_replace_partial_write_with_failed_restoration_reports_actual_residual_state(
    client, key_store, credentials, saved_settings, tmp_path, restore_failure
):
    def partial_save(key, secret):
        if key_store.save.call_count == 1:
            credentials[key] = secret
            raise ApiKeyStoreError("test_new_key test_partial_save_failure")
        if restore_failure == "raises":
            raise ApiKeyStoreError("test_openai_key test_restore_failure")
        # A backend returning normally is not proof of restoration: verification
        # must notice that the newly written credential is still present.

    key_store.save.side_effect = partial_save
    response = client.put(
        f"/settings/ai/providers/{OPENAI_KEY}/api-key", json={"api_key": "test_new_key"}
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_credential_state_uncertain"
    assert credentials == {OPENAI_KEY: "test_new_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings
    assert key_store.mock_calls == [
        call.get(OPENAI_KEY), call.save(OPENAI_KEY, "test_new_key"),
        call.save(OPENAI_KEY, "test_openai_key"), call.get(OPENAI_KEY),
    ]
    for marker in ("test_new_key", "test_openai_key", "test_partial_save_failure", "test_restore_failure"):
        assert marker not in response.text


def test_replace_key_save_failure_unverifiable_reports_uncertain(client, key_store, saved_settings):
    key_store.get.side_effect = ["test_openai_key", ApiKeyStoreError("test_get_failure")]
    key_store.save.side_effect = ApiKeyStoreError("test_save_failure")

    response = client.put(
        f"/settings/ai/providers/{OPENAI_KEY}/api-key", json={"api_key": "test_new_key"}
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_credential_state_uncertain"
    assert "test_save_failure" not in response.text
    assert "test_get_failure" not in response.text


def test_delete_unreferenced_provider_removes_config_and_credential(
    client, key_store, credentials, saved_settings
):
    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 204
    assert response.text == ""
    key_store.get.assert_called_once_with(DEEPSEEK_KEY)
    key_store.delete.assert_called_once_with(DEEPSEEK_KEY)
    assert credentials == {OPENAI_KEY: "test_openai_key"}

    saved = client.get("/settings").json()
    assert saved["ai"]["providers"] == [
        {
            "provider_key": str(OPENAI_KEY),
            "provider": "openai",
            "display_name": "test_openai",
            "monthly_budget_usd": 10,
        }
    ]
    assert saved["ai"]["tasks"] == [
        {"task": "test_search", "provider_key": str(OPENAI_KEY), "model": "test_model"},
    ]


def test_delete_provider_with_already_absent_credential_still_removes_config(
    client, key_store, credentials, saved_settings
):
    credentials.pop(DEEPSEEK_KEY)

    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 204
    assert DEEPSEEK_KEY not in credentials
    saved = client.get("/settings").json()
    assert [p["provider_key"] for p in saved["ai"]["providers"]] == [str(OPENAI_KEY)]


def test_delete_referenced_provider_returns_409_without_credential_change(
    client, key_store, credentials, saved_settings
):
    response = client.delete(f"/settings/ai/providers/{OPENAI_KEY}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "settings.ai_provider_in_use",
            "message": "This provider is used by a task. Clear its selection before deleting it.",
            "context": {},
        }
    }
    assert key_store.mock_calls == []
    assert credentials == {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert client.get("/settings").json() == saved_settings.model_dump(mode="json")


def test_delete_unknown_provider_returns_404(client, key_store):
    response = client.delete(f"/settings/ai/providers/{UNKNOWN_KEY}")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "settings.ai_provider_not_found"
    assert key_store.mock_calls == []


def test_delete_get_failure_reports_safe_operation_error(
    client, key_store, saved_settings, tmp_path
):
    key_store.get.side_effect = ApiKeyStoreError("test_get_failure")

    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_operation_failed"
    assert "test_get_failure" not in response.text
    key_store.delete.assert_not_called()
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_delete_credential_failure_with_verified_compensation(
    client, key_store, credentials, saved_settings, tmp_path
):
    states_after_delete = []

    def delete_then_fail(key):
        credentials.pop(key)
        states_after_delete.append(dict(credentials))
        raise ApiKeyStoreError("test_deepseek_key test_delete_failure")

    key_store.delete.side_effect = delete_then_fail

    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_operation_failed"
    assert "test_delete_failure" not in response.text
    assert "test_deepseek_key" not in response.text
    assert states_after_delete == [{OPENAI_KEY: "test_openai_key"}]
    assert credentials == {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert key_store.mock_calls == [
        call.get(DEEPSEEK_KEY), call.delete(DEEPSEEK_KEY),
        call.save(DEEPSEEK_KEY, "test_deepseek_key"), call.get(DEEPSEEK_KEY),
    ]
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_delete_partial_credential_failure_with_failed_restoration_is_uncertain(
    client, key_store, credentials, saved_settings, tmp_path
):
    def delete_then_fail(key):
        credentials.pop(key)
        raise ApiKeyStoreError("test_deepseek_key test_partial_delete_failure")

    key_store.delete.side_effect = delete_then_fail
    key_store.save.side_effect = ApiKeyStoreError("test_deepseek_key test_restore_failure")
    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_credential_state_uncertain"
    assert credentials == {OPENAI_KEY: "test_openai_key"}
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings
    assert key_store.mock_calls == [
        call.get(DEEPSEEK_KEY), call.delete(DEEPSEEK_KEY),
        call.save(DEEPSEEK_KEY, "test_deepseek_key"), call.get(DEEPSEEK_KEY),
    ]
    for marker in ("test_deepseek_key", "test_partial_delete_failure", "test_restore_failure"):
        assert marker not in response.text


def test_delete_sqlite_failure_restores_credential_and_reports_compensation(
    client, key_store, credentials, saved_settings, monkeypatch
):
    def fail_save(self, settings):
        raise sqlite3.OperationalError("test_sql_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)

    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_operation_failed"
    assert "test_sql_failure" not in response.text
    assert credentials[DEEPSEEK_KEY] == "test_deepseek_key"


@pytest.mark.parametrize("outcome", [
    "restored", "settings_uncertain", "credential_uncertain", "both_uncertain",
])
def test_delete_sqlite_commit_then_error_reports_verified_or_residual_states(
    client, key_store, credentials, saved_settings, tmp_path, monkeypatch, outcome
):
    expected_deleted = {
        "user": {"display_name": "test_first_name test_last_name"},
        "ai": {
            "providers": [{
                "provider_key": str(OPENAI_KEY), "provider": "openai",
                "display_name": "test_openai", "monthly_budget_usd": 10,
            }],
            "tasks": [{
                "task": "test_search", "provider_key": str(OPENAI_KEY), "model": "test_model",
            }],
        },
    }
    original_save = SettingsStore.save
    writes = []
    committed_states = []
    credentials_at_commit = []

    def commit_then_fail(store, settings):
        writes.append(settings.model_dump(mode="json"))
        if len(writes) == 1:
            original_save(store, settings)
            # Read the real committed SQLite data through a fresh Store before
            # the service can compensate. This is not a mocked save return value.
            committed_states.append(
                SettingsStore(tmp_path / "test.sqlite3").get().model_dump(mode="json")
            )
            credentials_at_commit.append(dict(credentials))
            raise sqlite3.OperationalError("test_deepseek_key test_after_commit_failure")
        if outcome in {"settings_uncertain", "both_uncertain"}:
            raise sqlite3.OperationalError("test_settings_restore_failure")
        original_save(store, settings)

    monkeypatch.setattr(SettingsStore, "save", commit_then_fail)
    if outcome in {"credential_uncertain", "both_uncertain"}:
        key_store.save.side_effect = ApiKeyStoreError("test_deepseek_key test_key_restore_failure")

    response = client.delete(f"/settings/ai/providers/{DEEPSEEK_KEY}")

    assert response.status_code == 500
    expected_code = {
        "restored": "settings.ai_operation_failed",
        "settings_uncertain": "settings.ai_settings_state_uncertain",
        "credential_uncertain": "settings.ai_credential_state_uncertain",
        "both_uncertain": "settings.ai_credential_state_uncertain",
    }[outcome]
    assert response.json()["detail"]["code"] == expected_code
    assert committed_states == [expected_deleted]
    assert credentials_at_commit == [{OPENAI_KEY: "test_openai_key"}]
    assert writes == [expected_deleted, saved_settings.model_dump(mode="json")]
    settings_restored = outcome in {"restored", "credential_uncertain"}
    expected_final = saved_settings.model_dump(mode="json") if settings_restored else expected_deleted
    assert SettingsStore(tmp_path / "test.sqlite3").get().model_dump(mode="json") == expected_final
    assert client.get("/settings").json() == expected_final
    expected_credentials = {OPENAI_KEY: "test_openai_key"}
    if outcome in {"restored", "settings_uncertain"}:
        expected_credentials[DEEPSEEK_KEY] = "test_deepseek_key"
    assert credentials == expected_credentials
    assert key_store.mock_calls == [
        call.get(DEEPSEEK_KEY), call.delete(DEEPSEEK_KEY),
        call.save(DEEPSEEK_KEY, "test_deepseek_key"), call.get(DEEPSEEK_KEY),
    ]
    if outcome in {"credential_uncertain", "both_uncertain"}:
        assert response.json()["detail"]["context"] == {"settings_restored": settings_restored}
    for marker in (
        "test_openai_key", "test_deepseek_key", "test_after_commit_failure",
        "test_settings_restore_failure", "test_key_restore_failure",
    ):
        assert marker not in response.text


def test_patch_sqlite_failure_returns_safe_error(client, key_store, saved_settings, monkeypatch):
    def fail_save(self, settings):
        raise sqlite3.OperationalError("test_sql_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)

    response = client.patch(
        f"/settings/ai/providers/{OPENAI_KEY}",
        json={"display_name": "test_updated", "monthly_budget_usd": 5},
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_settings_error"
    assert "test_sql_failure" not in response.text
    assert key_store.mock_calls == []


def test_patch_corrupt_settings_does_not_overwrite(client, key_store, tmp_path):
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            ("test_invalid_json",),
        )

    response = client.patch(
        f"/settings/ai/providers/{OPENAI_KEY}",
        json={"display_name": "test_updated", "monthly_budget_usd": 5},
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_settings_error"
    assert key_store.mock_calls == []
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (
            "test_invalid_json",
        )
