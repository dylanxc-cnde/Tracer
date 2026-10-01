from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.settings.models import AIProvider, AIProviderSettings


@pytest.mark.parametrize(
    ("value", "expected"),
    [("openai", AIProvider.OPENAI), ("deepseek", AIProvider.DEEPSEEK)],
)
def test_provider_accepts_allowed_platform_strings(value, expected):
    provider = AIProviderSettings(provider=value, display_name="test_provider")
    assert provider.provider is expected
    assert provider.model_dump(mode="json")["provider"] == value


def test_provider_schema_lists_only_allowed_platforms():
    schema = AIProviderSettings.model_json_schema()
    assert schema["$defs"]["AIProvider"]["enum"] == ["openai", "deepseek"]
    assert schema["properties"]["provider_key"]["format"] == "uuid"


@pytest.mark.parametrize("value", ["anthropic", "other", "OpenAI", "", None, 123, True])
def test_provider_rejects_unsupported_platforms(value):
    with pytest.raises(ValidationError):
        AIProviderSettings(provider=value, display_name="test_provider")


def test_new_provider_configurations_receive_distinct_uuid4_keys():
    first = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    second = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    assert isinstance(first.provider_key, UUID)
    assert first.provider_key.version == 4
    assert second.provider_key.version == 4
    assert first.provider_key != second.provider_key


@pytest.mark.parametrize("as_string", [False, True])
def test_existing_provider_key_is_preserved(as_string):
    key = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    provider = AIProviderSettings(
        provider_key=str(key) if as_string else key,
        provider=AIProvider.OPENAI,
        display_name="test_provider",
    )
    assert provider.provider_key == key
    restored = AIProviderSettings.model_validate_json(provider.model_dump_json())
    assert restored.provider_key == key


@pytest.mark.parametrize(
    "value", ["", " \t\n ", "test_provider", None, 123, True, b"test_value"]
)
def test_provider_key_rejects_invalid_uuids(value):
    with pytest.raises(ValidationError):
        AIProviderSettings(
            provider_key=value, provider=AIProvider.OPENAI, display_name="test_provider"
        )


def test_provider_display_name_is_trimmed_without_changing_case():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="  Test_Provider  ")
    assert provider.display_name == "Test_Provider"


@pytest.mark.parametrize("value", ["", " \t\n ", None, 123, True, b"test_provider"])
def test_provider_display_name_rejects_blank_or_non_string_values(value):
    with pytest.raises(ValidationError):
        AIProviderSettings(provider=AIProvider.OPENAI, display_name=value)


@pytest.mark.parametrize("field", ["provider", "display_name"])
def test_provider_requires_platform_and_display_name(field):
    payload = {"provider": "openai", "display_name": "test_provider"}
    del payload[field]
    with pytest.raises(ValidationError) as error:
        AIProviderSettings.model_validate(payload)
    assert error.value.errors()[0]["loc"] == (field,)
    assert error.value.errors()[0]["type"] == "missing"


def test_provider_rejects_api_keys():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        AIProviderSettings.model_validate(
            {
                "provider": "openai",
                "display_name": "test_provider",
                "api_key": "test_api_key",
            }
        )


@pytest.mark.parametrize("budget", [None, 0, 10, 12.5])
def test_monthly_budget_accepts_unset_or_finite_nonnegative_numbers(budget):
    provider = AIProviderSettings(
        provider=AIProvider.OPENAI, display_name="test_provider", monthly_budget_usd=budget
    )
    assert provider.monthly_budget_usd == budget


@pytest.mark.parametrize(
    "budget", [-1, float("inf"), float("-inf"), float("nan"), True, "10"]
)
def test_monthly_budget_rejects_invalid_values(budget):
    with pytest.raises(ValidationError):
        AIProviderSettings(
            provider=AIProvider.OPENAI, display_name="test_provider", monthly_budget_usd=budget
        )


def test_provider_budget_defaults_to_unset():
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    assert provider.monthly_budget_usd is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("provider_key", UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")),
        ("provider", AIProvider.DEEPSEEK),
        ("display_name", "test_updated"),
    ],
)
def test_provider_identity_and_metadata_are_frozen(field, value):
    provider = AIProviderSettings(provider=AIProvider.OPENAI, display_name="test_provider")
    with pytest.raises(ValidationError, match="frozen_instance"):
        setattr(provider, field, value)
