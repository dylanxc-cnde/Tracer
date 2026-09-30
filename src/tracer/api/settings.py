from pathlib import Path

from fastapi import APIRouter

from tracer.settings.models import AppSettings
from tracer.settings.services.read_settings import ReadSettingsService
from tracer.settings.services.update_user_settings import UpdateUserSettingsService
from tracer.settings.settings_store import SettingsStore

from .models.settings_models import UpdateUserSettingsRequest


def create_settings_router(*, database_path: Path) -> APIRouter:
    """Create settings routes backed by the supplied SQLite database."""
    settings_store = SettingsStore(database_path)
    read_settings_service = ReadSettingsService(settings_store)
    update_user_settings_service = UpdateUserSettingsService(settings_store)
    router = APIRouter(prefix="/settings", tags=["settings"])

    @router.get("")
    def read_settings() -> AppSettings:
        return read_settings_service.read()

    @router.patch("/user")
    def update_user_settings(request: UpdateUserSettingsRequest) -> AppSettings:
        return update_user_settings_service.update(request)

    return router
