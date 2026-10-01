from ..models import AppSettings
from ..settings_store import SettingsStore


class ReadSettingsService:
    def __init__(self, store: SettingsStore):
        self._settings_store = store

    def read(self) -> AppSettings:
        """Return saved settings, or unsaved defaults if no snapshot exists.

        Read and validation errors propagate; they do not mean settings are absent.
        """
        settings = self._settings_store.get()
        if settings is None:
            return AppSettings()
        return settings
