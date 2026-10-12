import pytest
from pydantic import SecretStr, ValidationError

from tracer.api.models.settings_models import CreateAIProviderRequest
from tracer.settings.models import AIProvider


def make_payload(**changes):
    return {
        "provider": "openai",
        "display_name": "test_provider",
        "api_key": "test_secret_api_key",
        **changes,
    }


@pytest.mark.parametrize("provider", ["openai", "deepseek"])
def test_create_request_accepts_supported_platforms_and_defaults(provider):
    request = CreateAIProviderRequest.model_validate(make_payload(provider=provider))

    assert request.provider is AIProvider(provider)
    assert request.display_name == "test_provider"
    assert request.monthly_budget_usd is None
    assert isinstance(request.api_key, SecretStr)
    assert request.api_key.get_secret_value() == "test_secret_api_key"


def test_create_request_trims_only_the_display_name():
    request = CreateAIProviderRequest.model_validate(
        make_payload(display_name="  Test_Provider  ", api_key=" test_opaque_key ")
    )

    assert request.display_name == "Test_Provider"
    assert request.api_key.get_secret_value() == " test_opaque_key "


@pytest.mark.parametrize("budget", [None, 0, 10, 12.5])
def test_create_request_accepts_unset_or_finite_nonnegative_budgets(budget):
    request = CreateAIProviderRequest.model_validate(make_payload(monthly_budget_usd=budget))

    assert request.monthly_budget_usd == budget


@pytest.mark.parametrize("field", ["provider", "display_name", "api_key"])
def test_create_request_requires_platform_name_and_key(field):
    payload = make_payload()
    del payload[field]

    with pytest.raises(ValidationError) as raised:
        CreateAIProviderRequest.model_validate(payload)

    assert raised.value.errors()[0]["loc"] == (field,)
    assert raised.value.errors()[0]["type"] == "missing"


@pytest.mark.parametrize("value", ["anthropic", "OpenAI", "", None, 123, True])
def test_create_request_rejects_unsupported_platforms(value):
    with pytest.raises(ValidationError):
        CreateAIProviderRequest.model_validate(make_payload(provider=value))


@pytest.mark.parametrize("value", ["", " \t\n ", None, 123, True, [], {}, b"test_value"])
@pytest.mark.parametrize("field", ["display_name", "api_key"])
def test_create_request_rejects_blank_or_non_string_text(field, value):
    with pytest.raises(ValidationError):
        CreateAIProviderRequest.model_validate(make_payload(**{field: value}))


@pytest.mark.parametrize("budget", [-1, float("inf"), float("-inf"), float("nan"), True, "10"])
def test_create_request_rejects_invalid_budgets(budget):
    with pytest.raises(ValidationError):
        CreateAIProviderRequest.model_validate(make_payload(monthly_budget_usd=budget))


@pytest.mark.parametrize("field", ["provider_key", "model", "tasks", "user", "unknown"])
def test_create_request_rejects_fields_outside_its_scope(field):
    with pytest.raises(ValidationError) as raised:
        CreateAIProviderRequest.model_validate(make_payload(**{field: "test_extra"}))

    assert raised.value.errors()[0]["loc"] == (field,)
    assert raised.value.errors()[0]["type"] == "extra_forbidden"


@pytest.mark.parametrize("field", ["provider", "display_name", "monthly_budget_usd", "api_key"])
def test_create_request_is_frozen(field):
    request = CreateAIProviderRequest.model_validate(make_payload())

    with pytest.raises(ValidationError, match="frozen_instance"):
        setattr(request, field, "test_updated")


def test_create_request_masks_the_key_in_representations_and_json():
    request = CreateAIProviderRequest.model_validate(make_payload())

    assert "test_secret_api_key" not in repr(request)
    assert "test_secret_api_key" not in str(request)
    assert "test_secret_api_key" not in request.model_dump_json()
    assert request.model_dump(mode="json")["api_key"] == "**********"


def test_validation_error_text_hides_the_secret_bearing_input():
    payload = make_payload()
    del payload["provider"]

    with pytest.raises(ValidationError) as raised:
        CreateAIProviderRequest.model_validate(payload)

    # errors() remains raw data; the HTTP layer must sanitize it separately.
    assert "test_secret_api_key" not in str(raised.value)


def test_create_request_schema_marks_the_key_write_only():
    schema = CreateAIProviderRequest.model_json_schema()

    assert schema["properties"]["api_key"]["writeOnly"] is True
    assert schema["properties"]["api_key"]["format"] == "password"
    assert "provider_key" not in schema["properties"]
