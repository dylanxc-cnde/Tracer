import sqlite3
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.settings_store import SettingsStore


@pytest.fixture
def saved_settings(tmp_path):
    provider_key = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    settings = AppSettings(
        user=UserSettings(display_name="test_first_name test_last_name"),
        ai=AISettings(
            providers=(
                AIProviderSettings(
                    provider_key=provider_key,
                    provider=AIProvider.DEEPSEEK,
                    display_name="test_provider",
                    monthly_budget_usd=12.5,
                ),
            ),
            tasks=(
                AITaskSettings(
                    task="test_search", provider_key=provider_key, model="test_model"
                ),
            ),
        ),
    )
    SettingsStore(tmp_path / "tracer.sqlite3").save(settings)
    return settings


def test_get_settings_returns_defaults_without_saving(tmp_path):
    database_path = tmp_path / "tracer.sqlite3"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.get("/settings")

    assert response.status_code == 200
    assert response.json() == {
        "user": {"display_name": None},
        "ai": {"providers": [], "tasks": []},
    }
    assert SettingsStore(database_path).get() is None


def test_get_settings_returns_the_complete_saved_snapshot(tmp_path, saved_settings):
    with TestClient(create_app(database_path=tmp_path / "tracer.sqlite3")) as client:
        response = client.get("/settings")

    assert response.status_code == 200
    assert response.json() == saved_settings.model_dump(mode="json")
    assert response.json()["ai"]["providers"][0]["provider_key"] == (
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    )


def test_first_user_update_persists_across_app_instances(tmp_path):
    database_path = tmp_path / "tracer.sqlite3"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch(
            "/settings/user", json={"display_name": "  test_first_name test_last_name  "}
        )

    assert response.status_code == 200
    assert response.json() == {
        "user": {"display_name": "test_first_name test_last_name"},
        "ai": {"providers": [], "tasks": []},
    }
    with TestClient(create_app(database_path=database_path)) as client:
        read_response = client.get("/settings")

    assert read_response.status_code == 200
    assert read_response.json() == response.json()


@pytest.mark.parametrize(
    ("display_name", "expected"),
    [("test_updated_name", "test_updated_name"), (None, None), (" \t ", None)],
)
def test_user_update_preserves_ai_configuration(tmp_path, saved_settings, display_name, expected):
    database_path = tmp_path / "tracer.sqlite3"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch("/settings/user", json={"display_name": display_name})

    assert response.status_code == 200
    assert response.json()["user"] == {"display_name": expected}
    assert response.json()["ai"] == saved_settings.ai.model_dump(mode="json")
    assert SettingsStore(database_path).get() == AppSettings.model_validate(response.json())


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"display_name": 123},
        {"display_name": True},
        {"display_name": []},
        {"display_name": None, "ai": {"providers": [], "tasks": []}},
        {"display_name": None, "api_key": "test_api_key"},
        {"user": {"display_name": "test_updated_name"}},
    ],
)
def test_user_update_rejects_invalid_requests_without_writing(tmp_path, saved_settings, payload):
    database_path = tmp_path / "tracer.sqlite3"

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.patch("/settings/user", json=payload)

    assert response.status_code == 422
    assert SettingsStore(database_path).get() == saved_settings


def test_settings_requests_do_not_construct_an_ai_client(tmp_path, monkeypatch):
    def fail_ai_client(*args, **kwargs):
        pytest.fail("Settings routes must not construct an AI client")

    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_ai_client)

    with TestClient(create_app(database_path=tmp_path / "tracer.sqlite3")) as client:
        assert client.get("/settings").status_code == 200
        assert client.patch("/settings/user", json={"display_name": None}).status_code == 200


@pytest.mark.parametrize("method", ["GET", "PATCH"])
def test_corrupt_saved_settings_return_server_error_without_overwriting(tmp_path, method):
    database_path = tmp_path / "tracer.sqlite3"
    app = create_app(database_path=database_path)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            ("test_invalid_json",),
        )
        connection.commit()

        with TestClient(app, raise_server_exceptions=False) as client:
            if method == "GET":
                response = client.get("/settings")
            else:
                response = client.patch("/settings/user", json={"display_name": "test_updated_name"})

        assert response.status_code == 500
        assert response.text == "Internal Server Error"
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (
            "test_invalid_json",
        )
    finally:
        connection.close()


def test_failed_save_returns_server_error_and_preserves_settings(tmp_path, saved_settings, monkeypatch):
    database_path = tmp_path / "tracer.sqlite3"

    def fail_save(self, settings):
        raise sqlite3.OperationalError("test_write_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)

    with TestClient(create_app(database_path=database_path), raise_server_exceptions=False) as client:
        response = client.patch("/settings/user", json={"display_name": "test_updated_name"})
        read_response = client.get("/settings")

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert read_response.status_code == 200
    assert read_response.json() == saved_settings.model_dump(mode="json")
