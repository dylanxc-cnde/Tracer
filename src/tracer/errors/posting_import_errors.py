from enum import StrEnum
from typing import Any

from .base_errors import TracerError


class PostingImportValidationReason(StrEnum):
    """Reasons a posting import can fail business validation."""

    TEXT_REQUIRED = "text_required"
    TIMEZONE_REQUIRED = "timezone_required"


class PostingImportError(TracerError):
    """Base class for errors while importing a posting."""

    code = "posting_import.error"


class PostingImportValidationError(
    PostingImportError,
    ValueError,
):
    """Raised when a posting import fails contract validation."""

    code = "posting_import.validation_error"

    def __init__(
        self,
        message: str,
        *,
        reason: PostingImportValidationReason,
        field_name: str | None = None,
        context: dict[str, Any] | None = None,
    ):
        if not isinstance(reason, PostingImportValidationReason):
            raise TypeError(
                "reason must be a PostingImportValidationReason"
            )

        self.reason = reason
        self.field_name = field_name

        error_context = dict(context or {})
        error_context["reason"] = reason.value
        if field_name is not None:
            error_context["field_name"] = field_name

        super().__init__(
            message,
            context=error_context,
        )
