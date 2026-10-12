import sqlite3
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.errors.settings_errors import ApiKeyStoreError
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import AppSettings
from tracer.settings.settings_store import SettingsStore

from tests.api.factories import make_create_ai_provider_request


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Settings HTTP tests must not use real credentials or AI clients")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def credentials():
    return {}


@pytest.fixture
def key_store(credentials):
    store = Mock(spec=ApiKeyStore)
    store.save.side_effect = lambda key, secret: credentials.update({key: secret})
    store.delete.side_effect = lambda key: credentials.pop(key, None) is not None
    return store


@pytest.fixture
def client(tmp_path, key_store):
    app = create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize("provider", ["openai", "deepseek"])
@pytest.mark.parametrize("budget", [None, 0, 12.5])
def test_create_provider_returns_201_and_persists_only_public_configuration(
    client, tmp_path, key_store, credentials, provider, budget
):
    response = client.post("/settings/ai/providers", json=make_create_ai_provider_request(
        provider=provider, display_name="  test_provider  ", monthly_budget_usd=budget,
    ))

    assert response.status_code == 201
    provider_key = UUID(response.json()["provider_key"])
    assert provider_key.version == 4
    assert response.json() == {
        "provider_key": str(provider_key), "provider": provider,
        "display_name": "test_provider", "monthly_budget_usd": budget,
    }
    assert credentials == {provider_key: "test_secret_api_key"}
    key_store.save.assert_called_once_with(provider_key, "test_secret_api_key")
    key_store.get.assert_not_called()
    key_store.delete.assert_not_called()

    database_path = tmp_path / "test.sqlite3"
    # A new app reads the same UUID without initializing native credential storage.
    with TestClient(create_app(database_path=database_path)) as reopened:
        saved = reopened.get("/settings")
    assert saved.status_code == 200
    assert saved.json() == {
        "user": {"display_name": None},
        "ai": {"providers": [response.json()], "tasks": []},
    }
    with sqlite3.connect(database_path) as connection:
        payload = connection.execute("SELECT payload_json FROM app_settings").fetchone()[0]
    assert "test_secret_api_key" not in payload + response.text + saved.text
    assert '"api_key"' not in payload + response.text + saved.text


def test_create_and_user_update_preserve_existing_provider_and_task(client, tmp_path):
    original = {
        "user": {"display_name": "test_first_name test_last_name"},
        "ai": {
            "providers": [{
                "provider_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "provider": "deepseek", "display_name": "test_existing_provider",
                "monthly_budget_usd": 10,
            }],
            "tasks": [{
                "task": "test_search", "provider_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "model": "test_model",
            }],
        },
    }
    SettingsStore(tmp_path / "test.sqlite3").save(AppSettings.model_validate(original))
    created = client.post("/settings/ai/providers", json=make_create_ai_provider_request())
    assert created.status_code == 201
    assert created.json()["monthly_budget_usd"] is None
    original["ai"]["providers"].append(created.json())
    assert client.get("/settings").json() == original

    updated = client.patch("/settings/user", json={"display_name": "test_updated_name"})
    assert updated.status_code == 200
    original["user"]["display_name"] = "test_updated_name"
    assert updated.json() == original
    assert client.get("/settings").json() == original


@pytest.mark.parametrize("changes", [
    {"provider": "unsupported"}, {"api_key": ["test_secret_api_key"]},
    {"display_name": " "}, {"api_key": " "}, {"monthly_budget_usd": -1},
    {"provider_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
    {"test_secret_api_key": "test_extra"}, {"model": "test_model"},
])
def test_invalid_body_is_sanitized_without_side_effects(client, key_store, tmp_path, changes):
    response = client.post(
        "/settings/ai/providers", json=make_create_ai_provider_request(**changes)
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI provider settings."}
    assert "test_secret_api_key" not in response.text
    assert key_store.mock_calls == []
    assert SettingsStore(tmp_path / "test.sqlite3").get() is None


@pytest.mark.parametrize("body", [
    '{"api_key":"test_secret_api_key"}',
    '{"api_key":"test_secret_api_key",',
    '[{"api_key":"test_secret_api_key"}]',
])
def test_missing_fields_and_malformed_json_never_echo_secrets(client, key_store, body):
    response = client.post(
        "/settings/ai/providers", content=body, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI provider settings."}
    assert key_store.mock_calls == []


@pytest.mark.parametrize("failure", ["credential_save", "settings_save", "cleanup"])
def test_create_failure_reports_cleanup_outcome_and_preserves_settings(
    client, tmp_path, key_store, credentials, monkeypatch, failure
):
    assert client.patch("/settings/user", json={"display_name": "test_name"}).status_code == 200
    before = client.get("/settings").json()

    def fail_credential_save(key, secret):
        credentials[key] = secret
        raise ApiKeyStoreError("test_secret_api_key test_backend_failure")

    def fail_settings_save(self, settings):
        raise sqlite3.OperationalError("test_secret_api_key test_sql_failure")

    if failure == "credential_save":
        key_store.save.side_effect = fail_credential_save
    else:
        monkeypatch.setattr(SettingsStore, "save", fail_settings_save)
    if failure == "cleanup":
        key_store.delete.side_effect = ApiKeyStoreError("test_secret_api_key test_delete_failure")

    response = client.post("/settings/ai/providers", json=make_create_ai_provider_request())

    assert response.status_code == 500
    detail = response.json()["detail"]
    expected_code = ("settings.ai_provider_cleanup_error" if failure == "cleanup"
                     else "settings.ai_provider_creation_error")
    assert detail["code"] == expected_code
    provider_key = UUID(detail["context"]["provider_key"])
    key_store.delete.assert_called_once_with(provider_key)
    assert credentials == ({provider_key: "test_secret_api_key"} if failure == "cleanup" else {})
    assert "test_secret_api_key" not in response.text
    assert "test_backend_failure" not in response.text
    assert "test_sql_failure" not in response.text
    assert "test_delete_failure" not in response.text
    assert client.get("/settings").json() == before


@pytest.mark.parametrize("payload", [
    "test_invalid_json",
    '{"ai":{"providers":[{"provider":"openai","display_name":"test_missing_uuid"}]}}',
])
def test_corrupt_settings_fail_before_credential_writes(client, tmp_path, key_store, payload):
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)", (payload,)
        )
    response = client.post("/settings/ai/providers", json=make_create_ai_provider_request())
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_provider_settings_error"
    assert key_store.mock_calls == []
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (payload,)


def test_database_read_error_is_sanitized(client, key_store, monkeypatch):
    monkeypatch.setattr(SettingsStore, "get", Mock(side_effect=sqlite3.OperationalError(
        "test_internal_database_path"
    )))
    response = client.post("/settings/ai/providers", json=make_create_ai_provider_request())
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_provider_settings_error"
    assert "test_internal_database_path" not in response.text
    assert key_store.mock_calls == []


def test_openapi_separates_write_only_key_from_public_response(client):
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/settings/ai/providers"]["post"]
    assert operation["tags"] == ["settings"]
    assert operation["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AIProviderSettings"
    }
    request = schema["components"]["schemas"]["CreateAIProviderRequest"]
    assert request["properties"]["api_key"]["writeOnly"] is True
    assert set(request["required"]) == {"provider", "display_name", "api_key"}
    assert "provider_key" not in request["properties"]
    assert "api_key" not in schema["components"]["schemas"]["AIProviderSettings"]["properties"]

    # Only the new secret-bearing route changes its validation error format.
    response = client.patch("/settings/user", json={"display_name": 42})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
