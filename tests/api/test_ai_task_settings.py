import sqlite3
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
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
        pytest.fail("Task settings tests must not construct AI clients or native credentials")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def key_store():
    return Mock(spec=ApiKeyStore)


@pytest.fixture
def client(tmp_path, key_store):
    app = create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


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
                ),
            ),
            tasks=(
                AITaskSettings(
                    task="test_summary", provider_key=OPENAI_KEY, model="test_other"
                ),
            ),
        ),
    )
    SettingsStore(tmp_path / "test.sqlite3").save(settings)
    return settings


def test_put_posting_parse_saves_openai_selection_and_preserves_other_tasks(
    client, key_store, saved_settings, tmp_path
):
    response = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(OPENAI_KEY), "model": "  test_parse_model  "},
    )

    assert response.status_code == 200
    assert response.json() == {
        "task": "posting_parse",
        "provider_key": str(OPENAI_KEY),
        "model": "test_parse_model",
    }
    assert key_store.mock_calls == []

    saved = client.get("/settings").json()
    assert saved["user"] == {"display_name": "test_first_name test_last_name"}
    assert saved["ai"]["providers"] == [
        {
            "provider_key": str(OPENAI_KEY),
            "provider": "openai",
            "display_name": "test_openai",
            "monthly_budget_usd": 10,
        },
        {
            "provider_key": str(DEEPSEEK_KEY),
            "provider": "deepseek",
            "display_name": "test_deepseek",
            "monthly_budget_usd": None,
        },
    ]
    assert saved["ai"]["tasks"] == [
        {"task": "test_summary", "provider_key": str(OPENAI_KEY), "model": "test_other"},
        {"task": "posting_parse", "provider_key": str(OPENAI_KEY), "model": "test_parse_model"},
    ]

    with TestClient(
        create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    ) as reopened:
        assert reopened.get("/settings").json() == saved


def test_put_posting_parse_replaces_existing_selection_without_duplicate(
    client, key_store, saved_settings
):
    first = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(OPENAI_KEY), "model": "test_first_model"},
    )
    assert first.status_code == 200
    second = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(OPENAI_KEY), "model": "test_second_model"},
    )
    assert second.status_code == 200

    saved = client.get("/settings").json()
    posting_parse_tasks = [
        task for task in saved["ai"]["tasks"] if task["task"] == "posting_parse"
    ]
    assert posting_parse_tasks == [
        {
            "task": "posting_parse",
            "provider_key": str(OPENAI_KEY),
            "model": "test_second_model",
        }
    ]
    assert len(saved["ai"]["tasks"]) == 2
    assert key_store.mock_calls == []


def test_put_posting_parse_rejects_deepseek(client, key_store, saved_settings, tmp_path):
    response = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(DEEPSEEK_KEY), "model": "test_model"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "settings.ai_provider_unsupported",
            "message": "Posting parsing supports only OpenAI providers.",
            "context": {},
        }
    }
    assert key_store.mock_calls == []
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_put_posting_parse_unknown_provider_returns_404(client, key_store, saved_settings):
    response = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(UNKNOWN_KEY), "model": "test_model"},
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


@pytest.mark.parametrize("body", [
    {"provider_key": str(OPENAI_KEY), "model": " "},
    {"provider_key": str(OPENAI_KEY), "model": "test_model", "task": "posting_parse"},
    {"provider_key": "not-a-uuid", "model": "test_model"},
    {"model": "test_model"},
    {"provider_key": str(OPENAI_KEY)},
])
def test_put_posting_parse_invalid_body_is_sanitized(
    client, key_store, saved_settings, tmp_path, body
):
    response = client.put("/settings/ai/tasks/posting_parse", json=body)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid AI settings."}
    assert key_store.mock_calls == []
    assert SettingsStore(tmp_path / "test.sqlite3").get() == saved_settings


def test_delete_posting_parse_clears_selection_and_preserves_other_tasks(
    client, key_store, saved_settings, tmp_path
):
    put = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(OPENAI_KEY), "model": "test_model"},
    )
    assert put.status_code == 200

    response = client.delete("/settings/ai/tasks/posting_parse")

    assert response.status_code == 204
    assert response.text == ""
    assert key_store.mock_calls == []

    saved = client.get("/settings").json()
    assert saved["ai"]["tasks"] == [
        {"task": "test_summary", "provider_key": str(OPENAI_KEY), "model": "test_other"},
    ]
    with TestClient(
        create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    ) as reopened:
        assert reopened.get("/settings").json() == saved


def test_delete_posting_parse_without_selection_is_idempotent(
    client, key_store, saved_settings
):
    response = client.delete("/settings/ai/tasks/posting_parse")

    assert response.status_code == 204
    assert key_store.mock_calls == []
    assert client.get("/settings").json() == saved_settings.model_dump(mode="json")


def test_put_posting_parse_corrupt_settings_does_not_overwrite(client, key_store, tmp_path):
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            ("test_invalid_json",),
        )

    response = client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": str(OPENAI_KEY), "model": "test_model"},
    )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "settings.ai_settings_error"
    assert key_store.mock_calls == []
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (
            "test_invalid_json",
        )
