from enum import StrEnum
from typing import Self
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class UserSettings(BaseModel):
    """User-facing preferences, not account credentials or candidate facts."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    display_name: str | None = Field(default=None, strict=True)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        """Treat blank names as unset so the UI can use its default greeting."""
        if value is None:
            return None
        return value.strip() or None


class AIProvider(StrEnum):
    OPENAI = "openai"
    DEEPSEEK = "deepseek"


class AIProviderSettings(BaseModel):
    """One named provider configuration; the same platform can have several."""

    model_config = ConfigDict(
        extra="forbid", frozen=True, str_strip_whitespace=True
    )

    provider_key: UUID = Field(default_factory=uuid4)
    provider: AIProvider
    display_name: str = Field(strict=True, min_length=1)
    monthly_budget_usd: float | None = Field(
        default=None,
        ge=0,
        strict=True,
        allow_inf_nan=False,
        description="Monthly USD budget; None is unset, zero is a zero budget. Not enforced here.",
    )


class AITaskSettings(BaseModel):
    """Model selection for one task; identifiers do not imply runtime support."""

    model_config = ConfigDict(
        extra="forbid", frozen=True, str_strip_whitespace=True
    )

    task: str = Field(strict=True, min_length=1)
    provider_key: UUID
    model: str = Field(strict=True, min_length=1)


class AISettings(BaseModel):
    """Provider budgets and task selections, without credentials or usage records."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    providers: tuple[AIProviderSettings, ...] = ()
    tasks: tuple[AITaskSettings, ...] = ()

    @field_validator("providers")
    @classmethod
    def validate_unique_providers(
        cls, providers: tuple[AIProviderSettings, ...]
    ) -> tuple[AIProviderSettings, ...]:
        if len({provider.provider_key for provider in providers}) != len(providers):
            raise ValueError("Provider keys must be unique")
        return providers

    @field_validator("tasks")
    @classmethod
    def validate_unique_tasks(
        cls, tasks: tuple[AITaskSettings, ...]
    ) -> tuple[AITaskSettings, ...]:
        if len({task.task for task in tasks}) != len(tasks):
            raise ValueError("Each task must have exactly one model selection")
        return tasks

    @model_validator(mode="after")
    def validate_task_providers(self) -> Self:
        """Reject selections whose provider is missing from this settings snapshot."""
        provider_keys = {provider.provider_key for provider in self.providers}
        for task in self.tasks:
            if task.provider_key not in provider_keys:
                raise ValueError("Task selections must reference a configured provider")
        return self


class AppSettings(BaseModel):
    """Non-secret settings for this local application."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    user: UserSettings = Field(default_factory=UserSettings)
    ai: AISettings = Field(default_factory=AISettings)
