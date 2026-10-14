from typing import TYPE_CHECKING
from uuid import UUID

from tracer.errors.settings_errors import AIProviderNotFoundError

from ..models import AIProviderSettings, AppSettings
from ..settings_store import SettingsStore

if TYPE_CHECKING:
    from tracer.api.models.settings_models import UpdateAIProviderRequest


class UpdateAIProviderService:
    """Update public fields only. The caller serializes the complete operation."""

    def __init__(self, settings_store: SettingsStore):
        self._settings_store = settings_store

    def update(
        self, provider_key: UUID, request: "UpdateAIProviderRequest"
    ) -> AIProviderSettings:
        settings = self._settings_store.get()
        if settings is None:
            raise AIProviderNotFoundError("Provider not found.")
        payload = settings.model_dump()
        for provider in payload["ai"]["providers"]:
            if provider["provider_key"] == provider_key:
                provider.update(request.model_dump())
                break
        else:
            raise AIProviderNotFoundError("Provider not found.")
        updated = AppSettings.model_validate(payload)
        self._settings_store.save(updated)
        return next(p for p in updated.ai.providers if p.provider_key == provider_key)
