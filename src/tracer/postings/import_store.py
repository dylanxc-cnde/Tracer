import sqlite3
from pathlib import Path
from uuid import UUID

from .import_models import PostingImportRequest


_CREATE_POSTING_IMPORT_TABLE = """
    CREATE TABLE IF NOT EXISTS posting_imports (
        import_key      TEXT PRIMARY KEY,
        schema_version  INTEGER NOT NULL,
        submitted_at    TEXT NOT NULL,
        source_kind     TEXT NOT NULL,
        payload_json    TEXT NOT NULL
    )
"""

_INSERT_POSTING_IMPORT = """
    INSERT INTO posting_imports(
        import_key,
        schema_version,
        submitted_at,
        source_kind,
        payload_json
    )
    VALUES(?, ?, ?, ?, ?)
"""

_SELECT_POSTING_IMPORT = """
    SELECT payload_json
    FROM posting_imports
    WHERE import_key = ?
"""

_CHECK_POSTING_IMPORT_EXISTS = """
    SELECT 1
    FROM posting_imports
    WHERE import_key = ?
    LIMIT 1
"""


class PostingImportRequestStore:
    """SQLite store for posting import requests.

    Args:
        database_path: The SQLite database file to use.
    """

    def __init__(self, database_path: Path):
        self._database_path = database_path
        self._create_table()

    def _create_table(self) -> None:
        """Create the posting import table if it does not exist."""
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(_CREATE_POSTING_IMPORT_TABLE)
            connection.commit()
        finally:
            connection.close()

    def add(self, request: PostingImportRequest) -> None:
        """Store one posting import request.

        Args:
            request: The posting import request to store.
        """
        connection = sqlite3.connect(self._database_path)
        try:
            connection.execute(
                _INSERT_POSTING_IMPORT,
                (
                    str(request.import_key),
                    request.schema_version,
                    request.submitted_at.isoformat(),
                    request.source.kind,
                    request.model_dump_json(),
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def get(self, import_key: UUID) -> PostingImportRequest | None:
        """Get one stored posting import request.

        Args:
            import_key: The posting import request to find.

        Returns:
            The stored request, or None if it does not exist.
        """
        connection = sqlite3.connect(self._database_path)
        try:
            row = connection.execute(
                _SELECT_POSTING_IMPORT,
                (str(import_key),),
            ).fetchone()
        finally:
            connection.close()

        if row is None:
            return None

        return PostingImportRequest.model_validate_json(row[0])

    def exists(self, import_key: UUID) -> bool:
        """Check whether a posting import request is stored.

        Args:
            import_key: The posting import request to find.

        Returns:
            True if the request exists, otherwise False.
        """
        connection = sqlite3.connect(self._database_path)

        try:
            row = connection.execute(
                _CHECK_POSTING_IMPORT_EXISTS,
                (str(import_key),),
            ).fetchone()
        finally:
            connection.close()

        return row is not None
