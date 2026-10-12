import sqlite3
import traceback
from unittest.mock import Mock
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.api.models.settings_models import CreateAIProviderRequest
from tracer.errors.settings_errors import (
    AIProviderCleanupError,
    AIProviderCreationError,
    ApiKeyStoreError,
)
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.services.create_ai_provider import CreateAIProviderService
from tracer.settings.settings_store import SettingsStore


EXISTING_PROVIDER_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
TEST_API_KEY = "test_secret_api_key"


@pytest.fixture(autouse=True)
def block_system_credentials(monkeypatch):
    def fail_system_access():
        pytest.fail("Service tests must not access the system credential store")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_system_access)


@pytest.fixture
def store(tmp_path):
    return SettingsStore(tmp_path / "user.sqlite3")


@pytest.fixture
def credentials():
    return {EXISTING_PROVIDER_KEY: "test_existing_api_key"}


@pytest.fixture
def key_store(credentials):
    store = Mock(spec=ApiKeyStore)

    def save(provider_key, api_key):
        credentials[provider_key] = api_key

    def delete(provider_key):
        return credentials.pop(provider_key, None) is not None

    store.save.side_effect = save
    store.delete.side_effect = delete
    return store


@pytest.fixture
def request_model():
    return CreateAIProviderRequest(
        provider="openai", display_name="test_provider", api_key=TEST_API_KEY
    )


@pytest.fixture
def saved_settings(store):
    settings = AppSettings(
        user=UserSettings(display_name="test_first_name test_last_name"),
        ai=AISettings(
            providers=(AIProviderSettings(
                provider_key=EXISTING_PROVIDER_KEY,
                provider=AIProvider.DEEPSEEK,
                display_name="test_existing_provider",
                monthly_budget_usd=12.5,
            ),),
            tasks=(AITaskSettings(
                task="test_search", provider_key=EXISTING_PROVIDER_KEY, model="test_model"
            ),),
        ),
    )
    store.save(settings)
    return settings


@pytest.mark.parametrize("provider", ["openai", "deepseek"])
@pytest.mark.parametrize("budget", [None, 0, 12.5])
def test_first_creation_saves_both_stores_and_returns_only_public_settings(
    store, key_store, credentials, tmp_path, provider, budget
):
    request = CreateAIProviderRequest(
        provider=provider,
        display_name="  Test_Provider  ",
        monthly_budget_usd=budget,
        api_key=" test_opaque_key ",
    )

    created = CreateAIProviderService(store, key_store).create(request)

    assert isinstance(created, AIProviderSettings)
    assert created.provider_key.version == 4
    assert created.provider.value == provider
    assert created.display_name == "Test_Provider"
    assert created.monthly_budget_usd == budget
    assert credentials[created.provider_key] == " test_opaque_key "
    assert SettingsStore(tmp_path / "user.sqlite3").get() == AppSettings(
        ai=AISettings(providers=(created,))
    )
    key_store.save.assert_called_once_with(created.provider_key, " test_opaque_key ")
    key_store.get.assert_not_called()
    key_store.delete.assert_not_called()
    assert "api_key" not in created.model_dump()

    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        payload = connection.execute("SELECT payload_json FROM app_settings").fetchone()[0]
    assert "api_key" not in payload
    assert "test_opaque_key" not in payload
    assert "test_opaque_key" not in created.model_dump_json()


def test_creation_preserves_latest_user_settings_providers_tasks_and_credentials(
    store, key_store, credentials, saved_settings, request_model, tmp_path, monkeypatch
):
    service = CreateAIProviderService(store, key_store)
    latest = AppSettings(
        user=UserSettings(display_name="test_updated_name"), ai=saved_settings.ai
    )
    SettingsStore(tmp_path / "user.sqlite3").save(latest)
    original_save = store.save

    def save_after_credential(settings):
        new_provider = settings.ai.providers[-1]
        assert credentials[new_provider.provider_key] == TEST_API_KEY
        assert store.get() == latest
        original_save(settings)

    monkeypatch.setattr(store, "save", save_after_credential)

    created = service.create(request_model)

    assert store.get() == AppSettings(
        user=latest.user,
        ai=AISettings(providers=(*latest.ai.providers, created), tasks=latest.ai.tasks),
    )
    assert credentials[EXISTING_PROVIDER_KEY] == "test_existing_api_key"
    assert request_model.api_key.get_secret_value() == TEST_API_KEY
    assert saved_settings.user.display_name == "test_first_name test_last_name"


def test_creation_generates_one_uuid_and_reuses_it_in_both_stores(
    store, key_store, request_model, monkeypatch
):
    expected_key = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    generate_key = Mock(return_value=expected_key)
    monkeypatch.setattr("tracer.settings.services.create_ai_provider.uuid4", generate_key)

    created = CreateAIProviderService(store, key_store).create(request_model)

    assert created.provider_key == expected_key
    key_store.save.assert_called_once_with(expected_key, TEST_API_KEY)
    for _ in range(2):
        assert store.get().ai.providers[0].provider_key == expected_key
    generate_key.assert_called_once_with()


def test_repeated_creations_are_distinct_even_with_the_same_platform_name_and_key(
    store, key_store, credentials, request_model
):
    service = CreateAIProviderService(store, key_store)

    first = service.create(request_model)
    second = service.create(request_model)

    assert isinstance(first.provider_key, UUID)
    assert first.provider_key.version == second.provider_key.version == 4
    assert first.provider_key != second.provider_key
    assert store.get().ai.providers == (first, second)
    assert credentials[first.provider_key] == credentials[second.provider_key] == TEST_API_KEY


def test_read_failure_propagates_before_any_write(
    store, key_store, saved_settings, request_model, monkeypatch
):
    with monkeypatch.context() as patch:
        patch.setattr(store, "get", Mock(side_effect=sqlite3.OperationalError("test_read_failure")))
        save = Mock()
        patch.setattr(store, "save", save)

        with pytest.raises(sqlite3.OperationalError, match="test_read_failure"):
            CreateAIProviderService(store, key_store).create(request_model)

        save.assert_not_called()

    assert store.get() == saved_settings
    assert key_store.mock_calls == []


@pytest.mark.parametrize("payload", [
    "test_invalid_json",
    '{"user":{"display_name":123}}',
    '{"ai":{"providers":[{"provider":"openai","display_name":"test_provider"}]}}',
])
def test_corrupt_settings_are_not_replaced_with_defaults(
    store, key_store, request_model, tmp_path, payload, monkeypatch
):
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)", (payload,)
        )

    generate_key = Mock()
    monkeypatch.setattr("tracer.settings.services.create_ai_provider.uuid4", generate_key)

    with pytest.raises(ValidationError):
        CreateAIProviderService(store, key_store).create(request_model)

    generate_key.assert_not_called()
    assert key_store.mock_calls == []
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (payload,)


def test_snapshot_validation_prevents_overwriting_an_existing_uuid(
    store, key_store, saved_settings, request_model, monkeypatch
):
    monkeypatch.setattr(
        "tracer.settings.services.create_ai_provider.uuid4", Mock(return_value=EXISTING_PROVIDER_KEY)
    )

    with pytest.raises(ValidationError, match="Provider keys must be unique"):
        CreateAIProviderService(store, key_store).create(request_model)

    assert store.get() == saved_settings
    assert key_store.mock_calls == []


@pytest.mark.parametrize("write_before_error", [False, True])
def test_key_save_failure_cleans_up_without_writing_settings(
    store, key_store, credentials, saved_settings, request_model, write_before_error
):
    def fail_key_save(provider_key, api_key):
        if write_before_error:
            credentials[provider_key] = api_key
        raise ApiKeyStoreError("test_backend_details")

    key_store.save.side_effect = fail_key_save

    with pytest.raises(AIProviderCreationError) as raised:
        CreateAIProviderService(store, key_store).create(request_model)

    provider_key = key_store.save.call_args.args[0]
    key_store.delete.assert_called_once_with(provider_key)
    assert store.get() == saved_settings
    assert credentials == {EXISTING_PROVIDER_KEY: "test_existing_api_key"}
    assert raised.value.context == {"provider_key": str(provider_key)}
    assert "test_backend_details" not in "".join(traceback.format_exception(raised.value))


@pytest.mark.parametrize("has_saved_settings", [False, True])
def test_real_sqlite_write_failure_removes_only_the_new_key(
    store, key_store, credentials, request_model, tmp_path, has_saved_settings
):
    before = AppSettings(user=UserSettings(display_name="test_first_name")) if has_saved_settings else None
    if before is not None:
        store.save(before)
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        connection.execute("""
            CREATE TRIGGER reject_settings_insert BEFORE INSERT ON app_settings
            BEGIN SELECT RAISE(ABORT, 'test_write_failure'); END
        """)

    with pytest.raises(AIProviderCreationError) as raised:
        CreateAIProviderService(store, key_store).create(request_model)

    provider_key = key_store.save.call_args.args[0]
    key_store.delete.assert_called_once_with(provider_key)
    assert store.get() == before
    assert credentials == {EXISTING_PROVIDER_KEY: "test_existing_api_key"}
    assert raised.value.code == "settings.ai_provider_creation_error"
    assert "test_write_failure" not in "".join(traceback.format_exception(raised.value))


def test_already_absent_key_counts_as_successful_cleanup(
    store, key_store, credentials, request_model, monkeypatch
):
    key_store.save.side_effect = None
    monkeypatch.setattr(store, "save", Mock(side_effect=sqlite3.OperationalError("test_write_failure")))

    with pytest.raises(AIProviderCreationError):
        CreateAIProviderService(store, key_store).create(request_model)

    assert store.get() is None
    assert credentials == {EXISTING_PROVIDER_KEY: "test_existing_api_key"}
    key_store.delete.assert_called_once()


@pytest.mark.parametrize("failed_store", ["settings", "credentials"])
def test_cleanup_failure_reports_the_uuid_without_exposing_secret_exception_details(
    store, key_store, credentials, saved_settings, request_model, monkeypatch, failed_store
):
    if failed_store == "settings":
        monkeypatch.setattr(store, "save", Mock(side_effect=sqlite3.OperationalError(TEST_API_KEY)))
    else:
        def fail_after_key_save(provider_key, api_key):
            credentials[provider_key] = api_key
            raise ApiKeyStoreError(TEST_API_KEY)

        key_store.save.side_effect = fail_after_key_save
    key_store.delete.side_effect = ApiKeyStoreError(TEST_API_KEY)

    with pytest.raises(AIProviderCleanupError) as raised:
        CreateAIProviderService(store, key_store).create(request_model)

    provider_key = key_store.save.call_args.args[0]
    assert raised.value.code == "settings.ai_provider_cleanup_error"
    assert raised.value.context == {"provider_key": str(provider_key)}
    assert store.get() == saved_settings
    assert credentials[provider_key] == TEST_API_KEY
    assert credentials[EXISTING_PROVIDER_KEY] == "test_existing_api_key"
    assert TEST_API_KEY not in str(raised.value.as_dict())
    assert TEST_API_KEY not in "".join(traceback.format_exception(raised.value))
