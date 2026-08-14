import pytest

from tracer.errors import (
    PostingImportError,
    PostingImportValidationError,
    PostingImportValidationReason,
    TracerError,
)


def test_posting_import_validation_error_has_catchable_layers():
    error = PostingImportValidationError(
        "timezone is required for submitted_at",
        reason=PostingImportValidationReason.TIMEZONE_REQUIRED,
        field_name="submitted_at",
    )

    with pytest.raises(TracerError) as exception_info:
        raise error

    caught_error = exception_info.value
    assert isinstance(caught_error, PostingImportError)
    assert isinstance(caught_error, ValueError)
    assert caught_error.code == "posting_import.validation_error"
    assert caught_error.reason is (
        PostingImportValidationReason.TIMEZONE_REQUIRED
    )
    assert caught_error.as_dict() == {
        "code": "posting_import.validation_error",
        "message": "timezone is required for submitted_at",
        "context": {
            "reason": "timezone_required",
            "field_name": "submitted_at",
        },
    }


def test_posting_import_validation_error_rejects_raw_reason_string():
    with pytest.raises(
        TypeError,
        match="reason must be a PostingImportValidationReason",
    ):
        PostingImportValidationError(
            "bad reason",
            reason="timezone_required",
        )
