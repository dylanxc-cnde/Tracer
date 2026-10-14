from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from tracer.postings.parsers.openai_posting_parser import (
    OpenAIPostingParser,
)
from tracer.settings.api_key_store import ApiKeyStore

from .postings import create_postings_router
from .settings import create_settings_router


DEFAULT_DATABASE_PATH = Path(".local/tracer.sqlite3")


def create_app(
    *,
    database_path: Path = DEFAULT_DATABASE_PATH,
    posting_parser: OpenAIPostingParser | None = None,
    api_key_store: ApiKeyStore | None = None,
) -> FastAPI:
    """Create the Tracer HTTP application.

    Args:
        database_path: The SQLite database file to use.
        posting_parser: An optional parser supplied by tests or the caller.
        api_key_store: Optional credential storage; defaults to lazy native storage.

    Returns:
        The configured FastAPI application.
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)

    app = FastAPI()
    credentials = api_key_store if api_key_store is not None else ApiKeyStore()

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        if request.method == "POST" and request.url.path == "/settings/ai/providers":
            # Validation errors can echo the full request, including secrets.
            # Do not serialize input, field names, context, or the raw error here.
            return JSONResponse(
                status_code=422, content={"detail": "Invalid AI provider settings."}
            )
        if request.method in {"PATCH", "PUT", "DELETE"} and (
            request.url.path.startswith("/settings/ai/providers/")
            or request.url.path == "/settings/ai/tasks/posting_parse"
        ):
            # Even public-field requests may contain unexpected sensitive fields,
            # or secrets in invalid path parameters. Do not echo any validation data.
            return JSONResponse(
                status_code=422, content={"detail": "Invalid AI settings."}
            )
        return await request_validation_exception_handler(request, error)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def get_health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(
        create_postings_router(
            database_path=database_path,
            posting_parser=posting_parser,
            api_key_store=credentials,
        )
    )
    app.include_router(
        create_settings_router(database_path=database_path, api_key_store=credentials)
    )

    return app


app = create_app()
