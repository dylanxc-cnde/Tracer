from typing import TYPE_CHECKING

from tracer.errors.settings_errors import (
    AIProviderNotFoundError,
    UnsupportedAIProviderError,
)

from ..models import POSTING_PARSE_TASK, AIProvider, AITaskSettings, AppSettings
from ..settings_store import SettingsStore

if TYPE_CHECKING:
    from tracer.api.models.settings_models import UpdateAITaskRequest


class UpdateAITaskService:
    """Maintain only the current parser selection, preserving all other task IDs."""

    def __init__(self, settings_store: SettingsStore):
        self._settings_store = settings_store

    def update(self, request: "UpdateAITaskRequest") -> AITaskSettings:
        settings = self._settings_store.get()
        if settings is None:
            raise AIProviderNotFoundError("Provider not found.")
        provider = next(
            (p for p in settings.ai.providers if p.provider_key == request.provider_key),
            None,
        )
        if provider is None:
            raise AIProviderNotFoundError("Provider not found.")
        if provider.provider != AIProvider.OPENAI:
            raise UnsupportedAIProviderError("Posting parsing supports only OpenAI providers.")
        selection = AITaskSettings(task=POSTING_PARSE_TASK, **request.model_dump())
        tasks = tuple(
            selection if t.task == POSTING_PARSE_TASK else t for t in settings.ai.tasks
        )
        if not any(t.task == POSTING_PARSE_TASK for t in settings.ai.tasks):
            tasks = (*tasks, selection)
        self._save_tasks(settings, tasks)
        return selection

    def clear(self) -> None:
        settings = self._settings_store.get()
        if settings is None or not any(
            t.task == POSTING_PARSE_TASK for t in settings.ai.tasks
        ):
            return
        self._save_tasks(
            settings, tuple(t for t in settings.ai.tasks if t.task != POSTING_PARSE_TASK)
        )

    def _save_tasks(self, settings: AppSettings, tasks: tuple[AITaskSettings, ...]) -> None:
        payload = settings.model_dump()
        payload["ai"]["tasks"] = tuple(t.model_dump() for t in tasks)
        self._settings_store.save(AppSettings.model_validate(payload))
