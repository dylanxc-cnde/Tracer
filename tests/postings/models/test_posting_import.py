from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.postings import PostingImportRequest, TextImport, UrlImport


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")
SUBMITTED_AT = datetime(
    2026,
    8,
    14,
    18,
    30,
    tzinfo=timezone(timedelta(hours=2)),
)


def make_request(**overrides) -> PostingImportRequest:
    data = {
        "import_key": IMPORT_KEY,
        "source": {
            "kind": "url",
            "url": "https://example.com/jobs/robotics",
        },
    }
    data.update(overrides)
    return PostingImportRequest(**data)


def test_import_request_generates_submission_time_in_utc():
    before_creation = datetime.now(UTC)
    request = make_request()
    after_creation = datetime.now(UTC)

    assert request.import_key == IMPORT_KEY
    assert request.schema_version == 1
    assert before_creation <= request.submitted_at <= after_creation
    assert request.submitted_at.tzinfo is UTC
    assert isinstance(request.source, UrlImport)
    assert str(request.source.url) == "https://example.com/jobs/robotics"


def test_import_request_normalizes_provided_submission_time_to_utc():
    request = make_request(submitted_at=SUBMITTED_AT)

    assert request.submitted_at == datetime(
        2026,
        8,
        14,
        16,
        30,
        tzinfo=UTC,
    )


def test_text_import_preserves_original_text_and_optional_source_url():
    original_text = "  Working Student Robotics\nApply by Friday.  "
    request = make_request(
        source={
            "kind": "text",
            "text": original_text,
            "source_url": "https://example.com/jobs/robotics",
        }
    )

    assert isinstance(request.source, TextImport)
    assert request.source.text == original_text
    assert str(request.source.source_url) == (
        "https://example.com/jobs/robotics"
    )


def test_text_import_rejects_blank_text():
    with pytest.raises(ValidationError) as exception_info:
        make_request(source={"kind": "text", "text": "  \n  "})

    error_details = exception_info.value.errors()[0]
    assert error_details["type"] == "value_error"
    assert error_details["loc"] == ("source", "text", "text")
    assert "non-whitespace" in error_details["msg"]


def test_import_request_rejects_naive_submission_time():
    with pytest.raises(ValidationError) as exception_info:
        make_request(submitted_at=datetime(2026, 8, 14, 18, 30))

    error_details = exception_info.value.errors()[0]
    assert error_details["type"] == "value_error"
    assert error_details["loc"] == ("submitted_at",)
    assert "timezone is required" in error_details["msg"]


def test_url_import_rejects_invalid_url_with_validation_error():
    with pytest.raises(ValidationError) as exception_info:
        make_request(source={"kind": "url", "url": "not-a-url"})

    error_details = exception_info.value.errors()[0]
    assert error_details["type"] == "url_parsing"
    assert error_details["loc"] == ("source", "url", "url")


def test_import_source_rejects_unknown_kind():
    with pytest.raises(ValidationError) as exception_info:
        make_request(source={"kind": "file", "path": "posting.pdf"})

    error_details = exception_info.value.errors()[0]
    assert error_details["type"] == "union_tag_invalid"
    assert error_details["loc"] == ("source",)


def test_import_models_reject_unknown_fields():
    with pytest.raises(ValidationError) as exception_info:
        make_request(
            source={
                "kind": "url",
                "url": "https://example.com/jobs/robotics",
                "html": "<html></html>",
            }
        )

    error_details = exception_info.value.errors()[0]
    assert error_details["type"] == "extra_forbidden"
    assert error_details["loc"] == ("source", "url", "html")


def test_import_request_is_frozen():
    request = make_request()

    with pytest.raises(ValidationError, match="Instance is frozen"):
        request.schema_version = 2


def test_import_request_json_round_trip_preserves_source_variant():
    request = make_request(
        source={
            "kind": "text",
            "text": "Working Student Robotics",
        }
    )

    restored = PostingImportRequest.model_validate_json(
        request.model_dump_json()
    )

    assert restored == request
    assert isinstance(restored.source, TextImport)
