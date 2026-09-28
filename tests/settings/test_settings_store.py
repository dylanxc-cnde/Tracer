import sqlite3
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.postings.models.posting_import import PostingImportRequest
from tracer.postings.stores.posting_import_request_store import PostingImportRequestStore
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)
from tracer.settings.settings_store import SettingsStore


TEST_PROVIDER_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
TEST_OTHER_PROVIDER_KEY = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
TEST_UNUSED_PROVIDER_KEY = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
TEST_MISSING_PROVIDER_KEY = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


def make_settings() -> AppSettings:
    return AppSettings(
        user=UserSettings(display_name="test_first_name test_last_name"),
        ai=AISettings(
            providers=(
                AIProviderSettings(
                    provider_key=TEST_PROVIDER_KEY,
                    provider=AIProvider.OPENAI,
                    display_name="test_provider",
                    monthly_budget_usd=12.5,
                ),
                AIProviderSettings(
                    provider_key=TEST_OTHER_PROVIDER_KEY,
                    provider=AIProvider.OPENAI,
                    display_name="test_provider",
                    monthly_budget_usd=0,
                ),
                AIProviderSettings(
                    provider_key=TEST_UNUSED_PROVIDER_KEY,
                    provider=AIProvider.DEEPSEEK,
                    display_name="test_other_provider",
                ),
            ),
            tasks=(
                AITaskSettings(
                    task="test_search", provider_key=TEST_PROVIDER_KEY, model="test_small"
                ),
                AITaskSettings(
                    task="test_extract", provider_key=TEST_OTHER_PROVIDER_KEY, model="test_small"
                ),
                AITaskSettings(
                    task="test_summary", provider_key=TEST_PROVIDER_KEY, model="test_large"
                ),
            ),
        ),
    )


def test_store_creates_an_empty_settings_table(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    store = SettingsStore(database_path)

    assert database_path.is_file()
    assert store.get() is None
    connection = sqlite3.connect(database_path)
    try:
        columns = connection.execute("PRAGMA table_info(app_settings)").fetchall()
        count = connection.execute("SELECT COUNT(*) FROM app_settings").fetchone()[0]
    finally:
        connection.close()

    assert [(column[1], column[2]) for column in columns] == [
        ("settings_key", "TEXT"),
        ("payload_json", "TEXT"),
    ]
    assert count == 0


@pytest.mark.parametrize("key", [None, "test_other_settings"])
def test_table_rejects_other_settings_keys(tmp_path, key):
    database_path = tmp_path / "user.sqlite3"
    SettingsStore(database_path)
    connection = sqlite3.connect(database_path)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO app_settings(settings_key, payload_json) VALUES(?, ?)",
                (key, AppSettings().model_dump_json()),
            )
    finally:
        connection.close()


def test_store_saves_the_complete_settings_json(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    store = SettingsStore(database_path)
    settings = make_settings()
    store.save(settings)

    connection = sqlite3.connect(database_path)
    try:
        rows = connection.execute(
            "SELECT settings_key, payload_json FROM app_settings"
        ).fetchall()
    finally:
        connection.close()

    assert rows == [("app", settings.model_dump_json())]
    assert store.get() == settings


def test_store_reopens_saved_settings_without_changing_uuid_or_enum_types(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    settings = make_settings()
    SettingsStore(database_path).save(settings)

    restored = SettingsStore(database_path).get()

    assert restored == settings
    assert isinstance(restored.ai.providers[0].provider_key, UUID)
    assert restored.ai.providers[0].provider is AIProvider.OPENAI
    assert restored.ai.providers[2].provider is AIProvider.DEEPSEEK


def test_save_replaces_the_snapshot_without_adding_rows(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    store = SettingsStore(database_path)
    original = make_settings()
    store.save(original)
    replacement = AppSettings(user=UserSettings(display_name="test_updated_name"))

    store.save(replacement)
    store.save(replacement)

    assert SettingsStore(database_path).get() == replacement
    assert store.get_provider_by_key(TEST_PROVIDER_KEY) is None
    assert store.get_task("test_search") is None
    connection = sqlite3.connect(database_path)
    try:
        count = connection.execute("SELECT COUNT(*) FROM app_settings").fetchone()[0]
    finally:
        connection.close()
    assert count == 1
    assert original.user.display_name == "test_first_name test_last_name"


def test_saved_defaults_are_distinct_from_unsaved_settings(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    assert store.get() is None

    store.save(AppSettings())

    assert store.get() == AppSettings()


def test_queries_return_empty_results_before_any_save(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    assert store.get_provider_by_key(TEST_PROVIDER_KEY) is None
    assert store.get_task("test_search") is None
    assert store.get_tasks_by_provider_key(TEST_PROVIDER_KEY) == ()
    assert store.get() is None


def test_provider_lookup_distinguishes_configurations_on_the_same_platform(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    settings = make_settings()
    store.save(settings)

    assert store.get_provider_by_key(TEST_PROVIDER_KEY) == settings.ai.providers[0]
    assert store.get_provider_by_key(TEST_OTHER_PROVIDER_KEY) == settings.ai.providers[1]
    assert store.get_provider_by_key(TEST_MISSING_PROVIDER_KEY) is None


def test_task_lookup_returns_the_selected_provider_and_model(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    store.save(make_settings())

    task = store.get_task("test_summary")

    assert task == AITaskSettings(
        task="test_summary", provider_key=TEST_PROVIDER_KEY, model="test_large"
    )
    assert store.get_task("test_missing_task") is None


def test_provider_task_lookup_returns_all_its_models_in_saved_order(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    settings = make_settings()
    store.save(settings)

    assert store.get_tasks_by_provider_key(TEST_PROVIDER_KEY) == (
        settings.ai.tasks[0], settings.ai.tasks[2]
    )
    assert store.get_tasks_by_provider_key(TEST_OTHER_PROVIDER_KEY) == (settings.ai.tasks[1],)
    assert store.get_tasks_by_provider_key(TEST_UNUSED_PROVIDER_KEY) == ()
    assert store.get_tasks_by_provider_key(TEST_MISSING_PROVIDER_KEY) == ()


def test_existing_store_reads_changes_saved_by_another_instance(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    reader = SettingsStore(database_path)
    writer = SettingsStore(database_path)
    assert reader.get() is None

    settings = make_settings()
    writer.save(settings)

    assert reader.get_provider_by_key(TEST_PROVIDER_KEY) == settings.ai.providers[0]
    writer.save(AppSettings())
    assert reader.get_task("test_summary") is None
    assert reader.get_tasks_by_provider_key(TEST_PROVIDER_KEY) == ()


def test_database_paths_are_isolated(tmp_path):
    first = SettingsStore(tmp_path / "test_first.sqlite3")
    second = SettingsStore(tmp_path / "test_second.sqlite3")
    settings = make_settings()
    first.save(settings)

    assert first.get() == settings
    assert second.get() is None


def test_display_name_is_stored_as_data_not_sql(tmp_path):
    store = SettingsStore(tmp_path / "user.sqlite3")
    settings = AppSettings(
        user=UserSettings(display_name="test_name'); DROP TABLE app_settings; --")
    )

    store.save(settings)

    assert store.get() == settings


@pytest.mark.parametrize("payload", ["test_invalid_json", '{"user":{"display_name":123}}'])
def test_invalid_stored_data_raises_without_resetting_it(tmp_path, payload):
    database_path = tmp_path / "user.sqlite3"
    store = SettingsStore(database_path)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            (payload,),
        )
        connection.commit()
        with pytest.raises(ValidationError):
            store.get()
        assert connection.execute("SELECT payload_json FROM app_settings").fetchone() == (payload,)
    finally:
        connection.close()


def test_write_failure_preserves_the_previous_snapshot(tmp_path):
    database_path = tmp_path / "user.sqlite3"
    store = SettingsStore(database_path)
    original = make_settings()
    store.save(original)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            """
            CREATE TRIGGER test_reject_settings_update
            BEFORE UPDATE ON app_settings
            BEGIN
                SELECT RAISE(ABORT, 'test_write_failure');
            END
            """
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(sqlite3.IntegrityError, match="test_write_failure"):
        store.save(AppSettings())

    assert store.get() == original


def test_settings_table_can_share_a_database_with_posting_tables(tmp_path):
    database_path = tmp_path / "test_shared.sqlite3"
    imports = PostingImportRequestStore(database_path)
    request = PostingImportRequest(
        import_key=TEST_PROVIDER_KEY,
        source={"kind": "text", "text": "test_posting_text"},
    )
    imports.add(request)
    store = SettingsStore(database_path)
    settings = make_settings()

    store.save(settings)

    assert imports.get(request.import_key) == request
    assert store.get() == settings
    store.save(AppSettings())
    assert imports.get(request.import_key) == request
