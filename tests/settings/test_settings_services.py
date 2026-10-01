import sqlite3
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.api.models.settings_models import UpdateUserSettingsRequest
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.services.read_settings import ReadSettingsService
from tracer.settings.services.update_user_settings import UpdateUserSettingsService
from tracer.settings.settings_store import SettingsStore


@pytest.fixture
def store(tmp_path):
    return SettingsStore(tmp_path / "user.sqlite3")


@pytest.fixture
def saved_settings(store):
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
                    task="test_search", provider_key=provider_key, model="test_small"
                ),
                AITaskSettings(
                    task="test_summary", provider_key=provider_key, model="test_large"
                ),
            ),
        ),
    )
    store.save(settings)
    return settings


def test_read_returns_defaults_without_saving_them(store):
    assert ReadSettingsService(store).read() == AppSettings()
    assert store.get() is None


def test_read_returns_the_complete_saved_settings(store, saved_settings):
    assert ReadSettingsService(store).read() == saved_settings
    assert store.get() == saved_settings


def test_read_observes_later_saves_without_caching_defaults(store, tmp_path):
    service = ReadSettingsService(store)
    assert service.read() == AppSettings()
    settings = AppSettings(user=UserSettings(display_name="test_updated_name"))
    SettingsStore(tmp_path / "user.sqlite3").save(settings)

    assert service.read() == settings


def test_first_user_update_saves_settings_and_can_be_reopened(store, tmp_path):
    request = UpdateUserSettingsRequest(display_name="test_first_name test_last_name")

    updated = UpdateUserSettingsService(store).update(request)

    assert updated == AppSettings(
        user=UserSettings(display_name="test_first_name test_last_name")
    )
    assert SettingsStore(tmp_path / "user.sqlite3").get() == updated
    assert ReadSettingsService(store).read() == updated


@pytest.mark.parametrize(
    ("display_name", "expected"),
    [
        ("  test_updated_name  ", "test_updated_name"),
        (None, None),
        ("", None),
        (" \t\n ", None),
    ],
)
def test_update_normalizes_the_name_and_preserves_ai_settings(
    store, saved_settings, display_name, expected
):
    request = UpdateUserSettingsRequest(display_name=display_name)

    updated = UpdateUserSettingsService(store).update(request)

    assert updated.user.display_name == expected
    assert updated.ai == saved_settings.ai
    assert store.get() == updated
    assert saved_settings.user.display_name == "test_first_name test_last_name"
    assert request.display_name == display_name


def test_update_preserves_settings_saved_after_service_creation(store, saved_settings, tmp_path):
    service = UpdateUserSettingsService(store)
    service.update(UpdateUserSettingsRequest(display_name="test_updated_name"))
    replacement = AppSettings(user=saved_settings.user)
    SettingsStore(tmp_path / "user.sqlite3").save(replacement)

    updated = service.update(UpdateUserSettingsRequest(display_name="test_last_name"))

    assert updated.user.display_name == "test_last_name"
    assert updated.ai == replacement.ai
    assert store.get() == updated


@pytest.mark.parametrize("operation", ["read", "update"])
@pytest.mark.parametrize("payload", ["test_invalid_json", '{"user":{"display_name":123}}'])
def test_invalid_stored_settings_are_not_replaced_with_defaults(store, tmp_path, operation, payload):
    connection = sqlite3.connect(tmp_path / "user.sqlite3")
    try:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            (payload,),
        )
        connection.commit()

        with pytest.raises(ValidationError):
            if operation == "read":
                ReadSettingsService(store).read()
            else:
                UpdateUserSettingsService(store).update(
                    UpdateUserSettingsRequest(display_name="test_updated_name")
                )

        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (payload,)
    finally:
        connection.close()


@pytest.mark.parametrize("operation", ["read", "update"])
def test_read_failures_propagate_without_saving(store, saved_settings, monkeypatch, operation):
    def fail_read():
        raise sqlite3.OperationalError("test_read_failure")

    def fail_unexpected_save(settings):
        pytest.fail("A failed read must not save settings")

    with monkeypatch.context() as patch:
        patch.setattr(store, "get", fail_read)
        patch.setattr(store, "save", fail_unexpected_save)

        with pytest.raises(sqlite3.OperationalError, match="test_read_failure"):
            if operation == "read":
                ReadSettingsService(store).read()
            else:
                UpdateUserSettingsService(store).update(
                    UpdateUserSettingsRequest(display_name="test_updated_name")
                )

    assert store.get() == saved_settings


def test_failed_save_does_not_return_success(store, saved_settings, monkeypatch):
    def fail_save(settings):
        raise sqlite3.OperationalError("test_write_failure")

    monkeypatch.setattr(store, "save", fail_save)

    with pytest.raises(sqlite3.OperationalError, match="test_write_failure"):
        UpdateUserSettingsService(store).update(
            UpdateUserSettingsRequest(display_name="test_updated_name")
        )

    assert store.get() == saved_settings
