import pytest
from pydantic import ValidationError

from tracer.settings.models import AISettings, AppSettings, UserSettings


def test_default_settings_have_no_display_name():
    assert AppSettings().user == UserSettings(display_name=None)
    assert AppSettings().ai == AISettings()
    assert AppSettings().model_dump() == {
        "user": {"display_name": None},
        "ai": {"providers": (), "tasks": ()},
    }


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        (" \t\n ", None),
        ("  test_first_name test_last_name  ", "test_first_name test_last_name"),
        ("test_first_name  test_last_name", "test_first_name  test_last_name"),
        ("\u2003test_first_name\u2003", "test_first_name"),
        ("test_first_name\u00a0test_last_name", "test_first_name\u00a0test_last_name"),
    ],
)
def test_display_name_normalization(value, expected):
    assert UserSettings(display_name=value).display_name == expected


@pytest.mark.parametrize("value", [123, True, [], {}, b"test_first_name"])
def test_display_name_rejects_non_string_values(value):
    with pytest.raises(ValidationError):
        UserSettings(display_name=value)


@pytest.mark.parametrize(
    "payload",
    [
        {"user": None},
        {"user": {"display_name": 123}},
        {"user": {"username": "test_username"}},
        {"display_name": "test_first_name"},
        {"ai": None},
        {"ai": {"api_key": "test_api_key"}},
    ],
)
def test_app_settings_validate_nested_fields_and_reject_unknown_fields(payload):
    with pytest.raises(ValidationError):
        AppSettings.model_validate(payload)


def test_both_settings_levels_are_frozen():
    settings = AppSettings()
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.user = UserSettings(display_name="test_first_name")
    with pytest.raises(ValidationError, match="frozen_instance"):
        settings.user.display_name = "test_first_name"


def test_settings_json_round_trip():
    settings = AppSettings.model_validate(
        {"user": {"display_name": "  test_first_name test_last_name  "}}
    )
    assert settings.user.display_name == "test_first_name test_last_name"
    assert AppSettings.model_validate_json(settings.model_dump_json()) == settings


def test_replacement_creates_a_validated_object_without_mutating_original():
    original = AppSettings(user=UserSettings(display_name="test_first_name"))
    replacement = AppSettings(user=UserSettings(display_name="  test_updated_name  "))
    assert original.user.display_name == "test_first_name"
    assert replacement.user.display_name == "test_updated_name"
