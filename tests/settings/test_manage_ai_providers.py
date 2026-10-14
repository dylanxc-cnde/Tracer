import sqlite3
from unittest.mock import Mock, call
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.api.models.settings_models import (
    ReplaceAIProviderKeyRequest,
    UpdateAIProviderRequest,
    UpdateAITaskRequest,
)
from tracer.errors.settings_errors import (
    AICredentialStateUncertainError,
    AIProviderInUseError,
    AIProviderNotFoundError,
    AISettingsOperationError,
    AISettingsStateUncertainError,
    ApiKeyStoreError,
    UnsupportedAIProviderError,
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
from tracer.settings.services.delete_ai_provider import DeleteAIProviderService
from tracer.settings.services.replace_ai_provider_key import ReplaceAIProviderKeyService
from tracer.settings.services.update_ai_provider import UpdateAIProviderService
from tracer.settings.services.update_ai_task import UpdateAITaskService
from tracer.settings.settings_store import SettingsStore


OPENAI_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
DEEPSEEK_KEY = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
UNKNOWN_KEY = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


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
    return {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}


@pytest.fixture
def key_store(credentials):
    store = Mock(spec=ApiKeyStore)
    store.get.side_effect = lambda key: credentials.get(key)
    store.save.side_effect = lambda key, secret: credentials.update({key: secret})
    store.delete.side_effect = lambda key: credentials.pop(key, None) is not None
    return store


@pytest.fixture
def saved_settings(store):
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
    store.save(settings)
    return settings


# --- UpdateAIProviderService ---


def test_update_public_fields_preserves_identity_and_other_config(store, key_store, saved_settings):
    request = UpdateAIProviderRequest(display_name="  test_updated  ", monthly_budget_usd=20.0)

    updated = UpdateAIProviderService(store).update(OPENAI_KEY, request)

    assert updated == AIProviderSettings(
        provider_key=OPENAI_KEY,
        provider=AIProvider.OPENAI,
        display_name="test_updated",
        monthly_budget_usd=20.0,
    )
    assert key_store.mock_calls == []
    restored = store.get()
    assert restored.ai.providers[0] == updated
    assert restored.ai.providers[1] == saved_settings.ai.providers[1]
    assert restored.ai.tasks == saved_settings.ai.tasks
    assert restored.user == saved_settings.user


def test_update_unknown_provider_raises_not_found(store, key_store, saved_settings):
    with pytest.raises(AIProviderNotFoundError):
        UpdateAIProviderService(store).update(
            UNKNOWN_KEY, UpdateAIProviderRequest(display_name="test", monthly_budget_usd=None)
        )
    assert key_store.mock_calls == []
    assert store.get() == saved_settings


def test_update_without_saved_settings_raises_not_found(store, key_store):
    with pytest.raises(AIProviderNotFoundError):
        UpdateAIProviderService(store).update(
            OPENAI_KEY, UpdateAIProviderRequest(display_name="test", monthly_budget_usd=None)
        )
    assert key_store.mock_calls == []


@pytest.mark.parametrize("payload", [
    "test_invalid_json",
    '{"ai":{"providers":[{"provider":"openai","display_name":"test_provider"}]}}',
])
def test_update_corrupt_settings_not_overwritten(store, key_store, tmp_path, payload):
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)", (payload,)
        )

    with pytest.raises(ValidationError):
        UpdateAIProviderService(store).update(
            OPENAI_KEY, UpdateAIProviderRequest(display_name="test", monthly_budget_usd=None)
        )
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (payload,)


# --- UpdateAIProviderRequest validation (non-finite reaches Pydantic directly) ---


@pytest.mark.parametrize("budget", [float("inf"), float("-inf"), float("nan")])
def test_update_request_rejects_non_finite_budget_at_validation(budget):
    with pytest.raises(ValidationError):
        UpdateAIProviderRequest(display_name="test", monthly_budget_usd=budget)


@pytest.mark.parametrize("kwargs", [
    {"display_name": "  ", "monthly_budget_usd": 5},
    {"display_name": "test", "monthly_budget_usd": -1},
    {"display_name": "test", "monthly_budget_usd": "10"},
    {"display_name": "test"},
    {"display_name": "test", "monthly_budget_usd": 5, "provider": "openai"},
])
def test_update_request_rejects_invalid_inputs(kwargs):
    with pytest.raises(ValidationError):
        UpdateAIProviderRequest(**kwargs)


def test_update_request_distinguishes_null_and_zero_budget():
    assert UpdateAIProviderRequest(
        display_name="test", monthly_budget_usd=None
    ).monthly_budget_usd is None
    assert UpdateAIProviderRequest(display_name="test", monthly_budget_usd=0).monthly_budget_usd == 0


# --- ReplaceAIProviderKeyService ---


def test_replace_writes_only_target_uuid_and_never_sqlite(
    store, key_store, credentials, saved_settings, tmp_path
):
    ReplaceAIProviderKeyService(store, key_store).replace(
        OPENAI_KEY, ReplaceAIProviderKeyRequest(api_key="  test_new_key  ")
    )

    assert credentials[OPENAI_KEY] == "  test_new_key  "
    assert credentials[DEEPSEEK_KEY] == "test_deepseek_key"
    key_store.get.assert_called_once_with(OPENAI_KEY)
    key_store.save.assert_called_once_with(OPENAI_KEY, "  test_new_key  ")
    key_store.delete.assert_not_called()
    assert SettingsStore(tmp_path / "user.sqlite3").get() == saved_settings


def test_replace_unknown_provider_raises_not_found(store, key_store, saved_settings):
    with pytest.raises(AIProviderNotFoundError):
        ReplaceAIProviderKeyService(store, key_store).replace(
            UNKNOWN_KEY, ReplaceAIProviderKeyRequest(api_key="test_new_key")
        )
    assert key_store.mock_calls == []


def test_replace_get_failure_reports_operation_failed_without_save(store, key_store, saved_settings):
    key_store.get.side_effect = ApiKeyStoreError("test_backend_details")

    with pytest.raises(AISettingsOperationError):
        ReplaceAIProviderKeyService(store, key_store).replace(
            OPENAI_KEY, ReplaceAIProviderKeyRequest(api_key="test_new_key")
        )
    key_store.save.assert_not_called()


def test_replace_save_failure_with_verified_compensation(store, key_store, credentials, saved_settings):
    key_store.save.side_effect = ApiKeyStoreError("test_backend_details")

    with pytest.raises(AISettingsOperationError):
        ReplaceAIProviderKeyService(store, key_store).replace(
            OPENAI_KEY, ReplaceAIProviderKeyRequest(api_key="test_new_key")
        )
    assert credentials[OPENAI_KEY] == "test_openai_key"


def test_replace_save_failure_unverifiable_reports_uncertain(store, key_store, credentials, saved_settings):
    key_store.get.side_effect = ["test_openai_key", ApiKeyStoreError("test_backend_details")]
    key_store.save.side_effect = ApiKeyStoreError("test_backend_details")

    with pytest.raises(AICredentialStateUncertainError):
        ReplaceAIProviderKeyService(store, key_store).replace(
            OPENAI_KEY, ReplaceAIProviderKeyRequest(api_key="test_new_key")
        )


@pytest.mark.parametrize("restore_delete", ["success", "raises", "silent_noop"])
def test_replace_partial_write_restores_previous_absence_or_reports_uncertainty(
    store, key_store, credentials, saved_settings, tmp_path, restore_delete
):
    # Missing credentials are valid previous states, not permission failures.
    credentials.pop(OPENAI_KEY)
    written_states = []

    def write_then_fail(key, secret):
        credentials[key] = secret
        written_states.append(dict(credentials))
        raise ApiKeyStoreError("test_new_key test_partial_save_failure")

    def restore_absence(key):
        if restore_delete == "raises":
            raise ApiKeyStoreError("test_new_key test_restore_delete_failure")
        if restore_delete == "silent_noop":
            return False
        return credentials.pop(key, None) is not None

    key_store.save.side_effect = write_then_fail
    key_store.delete.side_effect = restore_absence
    error_type = AISettingsOperationError if restore_delete == "success" else AICredentialStateUncertainError
    with pytest.raises(error_type) as raised:
        ReplaceAIProviderKeyService(store, key_store).replace(
            OPENAI_KEY, ReplaceAIProviderKeyRequest(api_key="test_new_key")
        )

    assert written_states == [{OPENAI_KEY: "test_new_key", DEEPSEEK_KEY: "test_deepseek_key"}]
    expected_credentials = {DEEPSEEK_KEY: "test_deepseek_key"}
    if restore_delete != "success":
        expected_credentials[OPENAI_KEY] = "test_new_key"
    assert credentials == expected_credentials
    assert key_store.mock_calls == [
        call.get(OPENAI_KEY), call.save(OPENAI_KEY, "test_new_key"),
        call.delete(OPENAI_KEY), call.get(OPENAI_KEY),
    ]
    assert SettingsStore(tmp_path / "user.sqlite3").get() == saved_settings
    for marker in ("test_new_key", "test_partial_save_failure", "test_restore_delete_failure"):
        assert marker not in str(raised.value.as_dict())


# --- DeleteAIProviderService ---


def test_delete_unreferenced_removes_config_and_credential(
    store, key_store, credentials, saved_settings, tmp_path
):
    DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)

    assert credentials == {OPENAI_KEY: "test_openai_key"}
    key_store.get.assert_called_once_with(DEEPSEEK_KEY)
    key_store.delete.assert_called_once_with(DEEPSEEK_KEY)
    restored = SettingsStore(tmp_path / "user.sqlite3").get()
    assert restored.ai.providers == (saved_settings.ai.providers[0],)
    assert restored.ai.tasks == saved_settings.ai.tasks
    assert restored.user == saved_settings.user


def test_delete_referenced_provider_raises_in_use_without_credential_access(
    store, key_store, credentials, saved_settings
):
    with pytest.raises(AIProviderInUseError):
        DeleteAIProviderService(store, key_store).delete(OPENAI_KEY)
    assert key_store.mock_calls == []
    assert credentials == {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert store.get() == saved_settings


def test_delete_unknown_provider_raises_not_found(store, key_store, saved_settings):
    with pytest.raises(AIProviderNotFoundError):
        DeleteAIProviderService(store, key_store).delete(UNKNOWN_KEY)
    assert key_store.mock_calls == []


def test_delete_already_absent_credential_still_removes_config(
    store, key_store, credentials, saved_settings
):
    credentials.pop(DEEPSEEK_KEY)

    DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)

    assert store.get().ai.providers == (saved_settings.ai.providers[0],)


def test_delete_get_failure_reports_operation_failed(store, key_store, saved_settings):
    key_store.get.side_effect = ApiKeyStoreError("test_backend_details")

    with pytest.raises(AISettingsOperationError):
        DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)
    key_store.delete.assert_not_called()


def test_delete_credential_failure_with_verified_compensation(store, key_store, credentials, saved_settings):
    key_store.delete.side_effect = ApiKeyStoreError("test_backend_details")

    with pytest.raises(AISettingsOperationError):
        DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)
    assert credentials[DEEPSEEK_KEY] == "test_deepseek_key"


def test_delete_sqlite_failure_restores_credential(store, key_store, credentials, saved_settings, monkeypatch):
    def fail_save(self, settings):
        raise sqlite3.OperationalError("test_write_failure")

    monkeypatch.setattr(SettingsStore, "save", fail_save)

    with pytest.raises(AISettingsOperationError):
        DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)
    assert credentials[DEEPSEEK_KEY] == "test_deepseek_key"


def test_delete_postcommit_corrupt_snapshot_is_preserved_not_overwritten(
    store, key_store, credentials, saved_settings, tmp_path, monkeypatch
):
    original_save = SettingsStore.save
    writes = []
    committed_states = []
    corrupt_payload = "test_invalid_json test_deepseek_key"

    def commit_corrupt_then_fail(current_store, settings):
        writes.append(settings)
        original_save(current_store, settings)
        committed_states.append(SettingsStore(tmp_path / "user.sqlite3").get())
        with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
            connection.execute(
                "UPDATE app_settings SET payload_json = ? WHERE settings_key = 'app'",
                (corrupt_payload,),
            )
        raise sqlite3.OperationalError("test_deepseek_key test_postcommit_failure")

    monkeypatch.setattr(SettingsStore, "save", commit_corrupt_then_fail)
    with pytest.raises(AISettingsStateUncertainError) as raised:
        DeleteAIProviderService(store, key_store).delete(DEEPSEEK_KEY)

    assert len(writes) == 1
    assert len(committed_states) == 1
    assert committed_states[0].ai.providers == (saved_settings.ai.providers[0],)
    assert committed_states[0].user == saved_settings.user
    assert committed_states[0].ai.tasks == saved_settings.ai.tasks
    # Failed validation during compensation must not trigger another settings
    # write, even though the old credential can be restored and verified.
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        assert connection.execute(
            "SELECT payload_json FROM app_settings WHERE settings_key = 'app'"
        ).fetchone() == (corrupt_payload,)
    assert credentials == {OPENAI_KEY: "test_openai_key", DEEPSEEK_KEY: "test_deepseek_key"}
    assert key_store.mock_calls == [
        call.get(DEEPSEEK_KEY), call.delete(DEEPSEEK_KEY),
        call.save(DEEPSEEK_KEY, "test_deepseek_key"), call.get(DEEPSEEK_KEY),
    ]
    assert raised.value.code == "settings.ai_settings_state_uncertain"
    for marker in ("test_invalid_json", "test_deepseek_key", "test_postcommit_failure"):
        assert marker not in str(raised.value.as_dict())


# --- UpdateAITaskService ---


def test_update_saves_openai_selection_and_preserves_other_tasks(
    store, key_store, saved_settings, tmp_path
):
    selection = UpdateAITaskService(store).update(
        UpdateAITaskRequest(provider_key=OPENAI_KEY, model="  test_parse_model  ")
    )

    assert selection == AITaskSettings(
        task="posting_parse", provider_key=OPENAI_KEY, model="test_parse_model"
    )
    assert key_store.mock_calls == []
    restored = SettingsStore(tmp_path / "user.sqlite3").get()
    assert restored.ai.tasks == (saved_settings.ai.tasks[0], selection)
    assert restored.ai.providers == saved_settings.ai.providers
    assert restored.user == saved_settings.user


def test_update_rejects_deepseek_for_posting_parse(store, key_store, saved_settings):
    with pytest.raises(UnsupportedAIProviderError):
        UpdateAITaskService(store).update(
            UpdateAITaskRequest(provider_key=DEEPSEEK_KEY, model="test_model")
        )
    assert key_store.mock_calls == []
    assert store.get() == saved_settings


def test_update_unknown_provider_raises_not_found(store, key_store, saved_settings):
    with pytest.raises(AIProviderNotFoundError):
        UpdateAITaskService(store).update(
            UpdateAITaskRequest(provider_key=UNKNOWN_KEY, model="test_model")
        )


def test_update_replaces_existing_selection(store, key_store, saved_settings):
    service = UpdateAITaskService(store)
    service.update(UpdateAITaskRequest(provider_key=OPENAI_KEY, model="test_first"))
    second = service.update(UpdateAITaskRequest(provider_key=OPENAI_KEY, model="test_second"))

    tasks = store.get().ai.tasks
    assert [t for t in tasks if t.task == "posting_parse"] == [second]
    assert len(tasks) == 2
    assert key_store.mock_calls == []


def test_clear_removes_selection_and_preserves_other_tasks(store, key_store, saved_settings):
    service = UpdateAITaskService(store)
    service.update(UpdateAITaskRequest(provider_key=OPENAI_KEY, model="test_model"))

    service.clear()

    assert store.get().ai.tasks == saved_settings.ai.tasks
    assert key_store.mock_calls == []


def test_clear_without_selection_is_idempotent(store, key_store, saved_settings):
    UpdateAITaskService(store).clear()
    assert store.get() == saved_settings
    assert key_store.mock_calls == []


def test_update_corrupt_settings_not_overwritten(store, key_store, tmp_path):
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            ("test_invalid_json",),
        )

    with pytest.raises(ValidationError):
        UpdateAITaskService(store).update(
            UpdateAITaskRequest(provider_key=OPENAI_KEY, model="test_model")
        )
    with sqlite3.connect(tmp_path / "user.sqlite3") as connection:
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (
            "test_invalid_json",
        )


def test_task_request_trims_model_and_rejects_blank_or_invalid_uuid():
    assert UpdateAITaskRequest(
        provider_key=OPENAI_KEY, model="  test_model  "
    ).model == "test_model"
    with pytest.raises(ValidationError):
        UpdateAITaskRequest(provider_key=OPENAI_KEY, model=" ")
    with pytest.raises(ValidationError):
        UpdateAITaskRequest(provider_key="not-a-uuid", model="test_model")
