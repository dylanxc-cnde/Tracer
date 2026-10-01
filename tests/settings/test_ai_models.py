from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
    UserSettings,
)


TEST_PROVIDER_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
TEST_OTHER_PROVIDER_KEY = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def test_one_provider_can_serve_multiple_tasks_with_different_models():
    settings = AISettings.model_validate(
        {
            "providers": [
                {
                    "provider_key": str(TEST_PROVIDER_KEY),
                    "provider": "openai",
                    "display_name": "test_provider",
                    "monthly_budget_usd": 10,
                },
            ],
            "tasks": [
                {
                    "task": "test_search",
                    "provider_key": str(TEST_PROVIDER_KEY).upper(),
                    "model": "test_small",
                },
                {
                    "task": "test_summary",
                    "provider_key": TEST_PROVIDER_KEY,
                    "model": "test_large",
                },
            ],
        }
    )

    assert isinstance(settings.providers, tuple)
    assert isinstance(settings.tasks, tuple)
    assert settings.providers[0].monthly_budget_usd == 10
    assert all(task.provider_key == TEST_PROVIDER_KEY for task in settings.tasks)
    assert [task.model for task in settings.tasks] == ["test_small", "test_large"]


def test_task_identifiers_trim_surrounding_whitespace_without_changing_case():
    task = AITaskSettings(
        task=" test_search ", provider_key=TEST_PROVIDER_KEY, model=" Test_Model-v2 "
    )
    assert task.task == "test_search"
    assert task.model == "Test_Model-v2"


@pytest.mark.parametrize("field", ["task", "model"])
@pytest.mark.parametrize("value", ["", " \t\n ", None, 123, True, b"test_value"])
def test_task_identifiers_reject_blank_or_non_string_values(field, value):
    payload = {"task": "test_search", "provider_key": TEST_PROVIDER_KEY, "model": "test_model"}
    payload[field] = value
    with pytest.raises(ValidationError):
        AITaskSettings.model_validate(payload)


@pytest.mark.parametrize(
    "value", ["", " \t\n ", "test_provider", None, 123, True, b"test_value"]
)
def test_task_provider_key_rejects_invalid_uuids(value):
    with pytest.raises(ValidationError):
        AITaskSettings(task="test_search", provider_key=value, model="test_model")


def test_multiple_configurations_can_share_a_platform_and_display_name():
    first = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    second = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    settings = AISettings(providers=(first, second))

    assert len(settings.providers) == 2
    assert first.provider_key != second.provider_key


def test_duplicate_provider_keys_are_rejected_across_platforms_and_uuid_formats():
    with pytest.raises(ValidationError, match="Provider keys must be unique"):
        AISettings.model_validate(
            {
                "providers": [
                    {
                        "provider_key": str(TEST_PROVIDER_KEY),
                        "provider": "openai",
                        "display_name": "test_first_provider",
                    },
                    {
                        "provider_key": str(TEST_PROVIDER_KEY).upper(),
                        "provider": "deepseek",
                        "display_name": "test_second_provider",
                    },
                ]
            }
        )


def test_duplicate_task_selections_are_rejected_even_with_different_models():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    with pytest.raises(ValidationError, match="Each task must have exactly one"):
        AISettings.model_validate(
            {
                "providers": [provider],
                "tasks": [
                    {
                        "task": "test_search",
                        "provider_key": provider.provider_key,
                        "model": "test_small",
                    },
                    {
                        "task": " test_search ",
                        "provider_key": provider.provider_key,
                        "model": "test_large",
                    },
                ],
            }
        )


def test_task_cannot_reference_a_missing_provider():
    with pytest.raises(ValidationError, match="reference a configured provider"):
        AISettings(
            tasks=(
                AITaskSettings(
                    task="test_search", provider_key=TEST_PROVIDER_KEY, model="test_model"
                ),
            )
        )


@pytest.mark.parametrize("field", ["providers", "tasks"])
def test_ai_collections_cannot_be_null(field):
    with pytest.raises(ValidationError):
        AISettings.model_validate({field: None})


@pytest.mark.parametrize("field", ["task", "provider_key", "model"])
def test_task_requires_all_fields(field):
    payload = {"task": "test_search", "provider_key": TEST_PROVIDER_KEY, "model": "test_model"}
    del payload[field]
    with pytest.raises(ValidationError) as error:
        AITaskSettings.model_validate(payload)
    assert error.value.errors()[0]["loc"] == (field,)
    assert error.value.errors()[0]["type"] == "missing"


def test_task_rejects_api_keys():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        AITaskSettings.model_validate(
            {
                "task": "test_search",
                "provider_key": TEST_PROVIDER_KEY,
                "model": "test_model",
                "api_key": "test_api_key",
            }
        )


def test_ai_settings_reject_usage_records():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        AISettings.model_validate({"usage": 10})


def test_all_ai_settings_levels_are_frozen():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    task = AITaskSettings(task="test_search", provider_key=provider.provider_key, model="test_model")
    settings = AppSettings(ai=AISettings(providers=(provider,), tasks=(task,)))

    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.ai = AISettings()
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.ai.providers += (
            AIProviderSettings(provider=AIProvider.DEEPSEEK, display_name="test_other"),
        )
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.ai.tasks = ()
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.ai.providers[0].monthly_budget_usd = 20
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.ai.tasks[0].model = "test_other_model"


def test_ai_settings_json_round_trip_with_multiple_providers():
    payload = {
        "user": {"display_name": "test_first_name test_last_name"},
        "ai": {
            "providers": [
                {
                    "provider_key": str(TEST_PROVIDER_KEY),
                    "provider": "openai",
                    "display_name": "test_first_provider",
                    "monthly_budget_usd": 12.5,
                },
                {
                    "provider_key": str(TEST_OTHER_PROVIDER_KEY),
                    "provider": "deepseek",
                    "display_name": "test_second_provider",
                    "monthly_budget_usd": 0,
                },
            ],
            "tasks": [
                {
                    "task": "test_search",
                    "provider_key": str(TEST_PROVIDER_KEY),
                    "model": "test_small",
                },
                {
                    "task": "test_summary",
                    "provider_key": str(TEST_OTHER_PROVIDER_KEY),
                    "model": "test_large",
                },
            ],
        },
    }
    settings = AppSettings.model_validate(payload)
    assert settings.model_dump(mode="json") == payload
    assert AppSettings.model_validate_json(settings.model_dump_json()) == settings


def test_replacing_ai_settings_preserves_user_and_does_not_mutate_original():
    original = AppSettings(user=UserSettings(display_name="test_first_name"))
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    replacement = AppSettings(
        user=original.user,
        ai=AISettings(providers=(provider,)),
    )
    assert replacement.user == original.user
    assert replacement.ai.providers[0].provider_key == provider.provider_key
    assert original.ai == AISettings()


def test_renaming_a_provider_preserves_its_key_and_task_references():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_original")
    task = AITaskSettings(task="test_search", provider_key=provider.provider_key, model="test_model")
    original = AISettings(providers=(provider,), tasks=(task,))
    updated_provider = AIProviderSettings.model_validate(
        {**provider.model_dump(), "display_name": "test_updated"}
    )
    replacement = AISettings(providers=(updated_provider,), tasks=original.tasks)

    assert replacement.providers[0].provider_key == provider.provider_key
    assert replacement.providers[0].display_name == "test_updated"
    assert replacement.tasks == original.tasks
    assert original.providers[0].display_name == "test_original"


def test_replacement_cannot_remove_a_provider_while_keeping_its_task():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    task = AITaskSettings(task="test_search", provider_key=provider.provider_key, model="test_model")
    original = AISettings(providers=(provider,), tasks=(task,))

    with pytest.raises(ValidationError, match="reference a configured provider"):
        AISettings(providers=(), tasks=original.tasks)

    assert original.providers == (provider,)
    assert original.tasks == (task,)
