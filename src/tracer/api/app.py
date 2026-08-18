from pathlib import Path

from fastapi import FastAPI

from tracer.postings.parsers.openai_posting_parser import (
    OpenAIPostingParser,
)

from .postings import create_postings_router


DEFAULT_DATABASE_PATH = Path(".local/tracer.sqlite3")


def create_app(
    *,
    database_path: Path = DEFAULT_DATABASE_PATH,
    posting_parser: OpenAIPostingParser | None = None,
) -> FastAPI:
    """Create the Tracer HTTP application.

    Args:
        database_path: The SQLite database file to use.
        posting_parser: An optional parser supplied by tests or the caller.

    Returns:
        The configured FastAPI application.
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)

    app = FastAPI()

    @app.get("/health")
    def get_health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(
        create_postings_router(
            database_path=database_path,
            posting_parser=posting_parser,
        )
    )

    return app


app = create_app()
