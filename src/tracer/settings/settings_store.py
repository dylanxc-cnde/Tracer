import sqlite3
from pathlib import Path
from uuid import UUID

from .models import AIProviderSettings, AITaskSettings, AppSettings


_CREATE_SETTINGS_TABLE = """
    CREATE TABLE IF NOT EXISTS app_settings (
        settings_key TEXT PRIMARY KEY NOT NULL CHECK (settings_key = 'app'),
        payload_json TEXT NOT NULL
    )
"""

_SAVE_SETTINGS = """
    INSERT INTO app_settings(settings_key, payload_json)
    VALUES('app', ?)
    ON CONFLICT(settings_key) DO UPDATE SET
        payload_json = excluded.payload_json
"""

_SELECT_SETTINGS = """
    SELECT payload_json
    FROM app_settings
    WHERE settings_key = 'app'
"""


class SettingsStore:
    """SQLite store for one local application's non-secret settings.

    Args:
        database_path: The SQLite file to use; its parent directory must exist.
    """

    def __init__(self, database_path: Path):
        self._database_path = database_path
        self._create_table()

    def _create_table(self) -> None:
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(_CREATE_SETTINGS_TABLE)
            connection.commit()
        finally:
            connection.close()

    def get(self) -> AppSettings | None:
        """Read the saved snapshot, or None if no settings have been saved.

        Invalid stored data raises a validation error rather than silently
        replacing the user's configuration with defaults.
        """
        connection = sqlite3.connect(self._database_path)

        try:
            row = connection.execute(_SELECT_SETTINGS).fetchone()
        finally:
            connection.close()

        if row is None:
            return None

        return AppSettings.model_validate_json(row[0])

    def save(self, settings: AppSettings) -> None:
        """Insert or replace the complete validated settings snapshot.

        This is not a partial update: callers must preserve unchanged fields
        and existing provider keys when constructing a replacement.
        """
        payload_json = settings.model_dump_json()
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(_SAVE_SETTINGS, (payload_json,))
            connection.commit()
        finally:
            connection.close()

    def get_provider_by_key(self, provider_key: UUID) -> AIProviderSettings | None:
        """Return one provider configuration, or None if it is not configured."""
        settings = self.get()
        if settings is None:
            return None

        for provider in settings.ai.providers:
            if provider.provider_key == provider_key:
                return provider
        return None

    def get_task(self, task: str) -> AITaskSettings | None:
        """Return the provider key and model selected for an exact task name."""
        settings = self.get()
        if settings is None:
            return None

        for selection in settings.ai.tasks:
            if selection.task == task:
                return selection
        return None

    def get_tasks_by_provider_key(self, provider_key: UUID) -> tuple[AITaskSettings, ...]:
        """Return this provider's task selections in their saved order.

        One provider may serve several models. An unknown or unused provider
        returns an empty tuple, as does an unsaved settings snapshot.
        """
        settings = self.get()
        if settings is None:
            return ()

        return tuple(
            task for task in settings.ai.tasks if task.provider_key == provider_key
        )
