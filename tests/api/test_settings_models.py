import pytest
from pydantic import ValidationError

from tracer.api.models.settings_models import UpdateUserSettingsRequest


@pytest.mark.parametrize("display_name", ["test_first_name test_last_name", None, ""])
def test_user_settings_request_accepts_an_explicit_name_or_clear(display_name):
    request = UpdateUserSettingsRequest.model_validate({"display_name": display_name})

    assert request.display_name == display_name
    assert request.model_dump() == {"display_name": display_name}


def test_user_settings_request_requires_display_name():
    with pytest.raises(ValidationError) as error:
        UpdateUserSettingsRequest.model_validate({})

    assert error.value.errors()[0]["type"] == "missing"
    assert error.value.errors()[0]["loc"] == ("display_name",)


@pytest.mark.parametrize("value", [123, True, [], {}, b"test_first_name"])
def test_user_settings_request_rejects_non_string_names(value):
    with pytest.raises(ValidationError) as error:
        UpdateUserSettingsRequest.model_validate({"display_name": value})

    assert error.value.errors()[0]["type"] == "string_type"


@pytest.mark.parametrize("field", ["ai", "api_key", "username"])
def test_user_settings_request_rejects_fields_outside_its_scope(field):
    with pytest.raises(ValidationError) as error:
        UpdateUserSettingsRequest.model_validate({"display_name": None, field: None})

    assert error.value.errors()[0]["type"] == "extra_forbidden"
    assert error.value.errors()[0]["loc"] == (field,)


def test_user_settings_request_is_frozen():
    request = UpdateUserSettingsRequest(display_name="test_first_name")

    with pytest.raises(ValidationError, match="frozen_instance"):
        request.display_name = "test_updated_name"
