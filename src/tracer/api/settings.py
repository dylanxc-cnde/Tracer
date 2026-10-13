import sqlite3
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from tracer.errors.settings_errors import AIProviderCleanupError, AIProviderCreationError
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import AIProviderSettings, AppSettings
from tracer.settings.services.create_ai_provider import CreateAIProviderService
from tracer.settings.services.read_settings import ReadSettingsService
from tracer.settings.services.update_user_settings import UpdateUserSettingsService
from tracer.settings.settings_store import SettingsStore

from .models.settings_models import CreateAIProviderRequest, UpdateUserSettingsRequest


def create_settings_router(
    *, database_path: Path, api_key_store: ApiKeyStore | None = None
) -> APIRouter:
    """Create settings routes backed by the supplied SQLite database."""
    settings_store = SettingsStore(database_path)
    read_settings_service = ReadSettingsService(settings_store)
    update_user_settings_service = UpdateUserSettingsService(settings_store)
    create_ai_provider_service = CreateAIProviderService(
        settings_store, api_key_store if api_key_store is not None else ApiKeyStore()
    )
    # Share one lock across complete read-modify-save operations in this router.
    # It does not coordinate other app instances or backend processes.
    settings_write_lock = Lock()
    
    router = APIRouter(prefix="/settings", tags=["settings"])

    @router.get("")
    def read_settings() -> AppSettings:
        return read_settings_service.read()

    @router.patch("/user")
    def update_user_settings(request: UpdateUserSettingsRequest) -> AppSettings:
        with settings_write_lock:
            return update_user_settings_service.update(request)

    @router.post("/ai/providers", status_code=201)
    def create_ai_provider(request: CreateAIProviderRequest) -> AIProviderSettings:
        try:
            with settings_write_lock:
                return create_ai_provider_service.create(request)
        except (AIProviderCreationError, AIProviderCleanupError) as error:
            # Service errors contain safe messages and the new UUID, never the key.
            raise HTTPException(status_code=500, detail=error.as_dict()) from None
        except (sqlite3.Error, ValidationError):
            # Reading or validating saved settings failed before credential writes.
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "settings.ai_provider_settings_error",
                    "message": "Could not load valid settings to create the provider.",
                    "context": {},
                },
            ) from None

    return router
