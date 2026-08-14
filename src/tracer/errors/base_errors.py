from typing import Any


class TracerError(Exception):
    """Base class for errors owned by Tracer."""

    code = "tracer.error"

    def __init__(
        self,
        message: str,
        *,
        context: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.context = context or {}

    def as_dict(self) -> dict[str, Any]:
        """Return the stable error shape used by callers and logs."""

        return {
            "code": self.code,
            "message": str(self),
            "context": self.context,
        }
