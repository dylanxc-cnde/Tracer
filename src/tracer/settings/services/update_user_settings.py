from typing import TYPE_CHECKING

from ..models import AppSettings
from ..settings_store import SettingsStore

if TYPE_CHECKING:
    from tracer.api.models.settings_models import UpdateUserSettingsRequest


class UpdateUserSettingsService:
    def __init__(self, store: SettingsStore):
        self._settings_store = store

    def update(self, request: "UpdateUserSettingsRequest") -> AppSettings:
        """Save User settings and return the complete validated snapshot.

        Unchanged settings come from storage, not from the request. The first
        save starts from defaults; read, validation and write errors propagate.
        """
        settings = self._settings_store.get()
        if settings is None:
            settings = AppSettings()

        payload = settings.model_dump()
        payload["user"]["display_name"] = request.display_name
        updated_settings = AppSettings.model_validate(payload)
        self._settings_store.save(updated_settings)

        return updated_settings
