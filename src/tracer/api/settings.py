import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from tracer.errors.settings_errors import (
    AICredentialStateUncertainError,
    AIProviderCleanupError,
    AIProviderCreationError,
    AIProviderInUseError,
    AIProviderNotFoundError,
    AISettingsOperationError,
    AISettingsStateUncertainError,
    UnsupportedAIProviderError,
)
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import AIProviderSettings, AITaskSettings, AppSettings
from tracer.settings.services.create_ai_provider import CreateAIProviderService
from tracer.settings.services.delete_ai_provider import DeleteAIProviderService
from tracer.settings.services.read_settings import ReadSettingsService
from tracer.settings.services.replace_ai_provider_key import ReplaceAIProviderKeyService
from tracer.settings.services.update_ai_provider import UpdateAIProviderService
from tracer.settings.services.update_ai_task import UpdateAITaskService
from tracer.settings.services.update_user_settings import UpdateUserSettingsService
from tracer.settings.settings_store import SettingsStore

from .models.settings_models import (
    CreateAIProviderRequest,
    ReplaceAIProviderKeyRequest,
    UpdateAIProviderRequest,
    UpdateAITaskRequest,
    UpdateUserSettingsRequest,
)


def create_settings_router(
    *, database_path: Path, api_key_store: ApiKeyStore | None = None
) -> APIRouter:
    """Create settings routes backed by the supplied SQLite database."""
    settings_store = SettingsStore(database_path)
    read_settings_service = ReadSettingsService(settings_store)
    update_user_settings_service = UpdateUserSettingsService(settings_store)
    credentials = api_key_store if api_key_store is not None else ApiKeyStore()
    create_ai_provider_service = CreateAIProviderService(settings_store, credentials)
    update_ai_provider_service = UpdateAIProviderService(settings_store)
    replace_ai_provider_key_service = ReplaceAIProviderKeyService(settings_store, credentials)
    delete_ai_provider_service = DeleteAIProviderService(settings_store, credentials)
    update_ai_task_service = UpdateAITaskService(settings_store)
    # Share one lock across complete read-modify-save operations in this router.
    # It does not coordinate other app instances or backend processes.
    settings_write_lock = Lock()

    router = APIRouter(prefix="/settings", tags=["settings"])

    @contextmanager
    def ai_settings_write() -> Iterator[None]:
        """Serialize new writes and expose only application-owned safe errors."""
        try:
            with settings_write_lock:
                yield
        except AIProviderNotFoundError:
            raise HTTPException(status_code=404, detail={
                "code": AIProviderNotFoundError.code,
                "message": "Provider not found.", "context": {},
            }) from None
        except AIProviderInUseError:
            raise HTTPException(status_code=409, detail={
                "code": AIProviderInUseError.code,
                "message": "This provider is used by a task. Clear its selection before deleting it.",
                "context": {},
            }) from None
        except UnsupportedAIProviderError:
            raise HTTPException(status_code=422, detail={
                "code": UnsupportedAIProviderError.code,
                "message": "Posting parsing supports only OpenAI providers.", "context": {},
            }) from None
        except (
            AISettingsOperationError,
            AICredentialStateUncertainError,
            AISettingsStateUncertainError,
        ) as error:
            # These services construct fixed messages and bounded non-secret context.
            raise HTTPException(status_code=500, detail=error.as_dict()) from None
        except Exception:
            # Includes saved-data validation, SQLite and unexpected backend failures.
            # A reported write error is not proof that no write committed.
            raise HTTPException(status_code=500, detail={
                "code": "settings.ai_settings_error",
                "message": "Could not complete the settings operation. Refresh settings before retrying; the result may be unconfirmed.",
                "context": {},
            }) from None

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

    @router.patch("/ai/providers/{provider_key}")
    def update_ai_provider(
        provider_key: UUID, request: UpdateAIProviderRequest
    ) -> AIProviderSettings:
        with ai_settings_write():
            return update_ai_provider_service.update(provider_key, request)

    @router.put("/ai/providers/{provider_key}/api-key", status_code=204)
    def replace_ai_provider_key(
        provider_key: UUID, request: ReplaceAIProviderKeyRequest
    ) -> None:
        with ai_settings_write():
            replace_ai_provider_key_service.replace(provider_key, request)

    @router.delete("/ai/providers/{provider_key}", status_code=204)
    def delete_ai_provider(provider_key: UUID) -> None:
        with ai_settings_write():
            delete_ai_provider_service.delete(provider_key)

    @router.put("/ai/tasks/posting_parse")
    def update_posting_parse_settings(request: UpdateAITaskRequest) -> AITaskSettings:
        with ai_settings_write():
            return update_ai_task_service.update(request)

    @router.delete("/ai/tasks/posting_parse", status_code=204)
    def clear_posting_parse_settings() -> None:
        with ai_settings_write():
            update_ai_task_service.clear()

    return router
