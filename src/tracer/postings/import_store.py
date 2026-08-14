import sqlite3
from pathlib import Path

_CREATE_POSTING_IMPORT_TABLE = """
    CREATE TABLE IF NOT EXISTS posting_imports (
        import_key      TEXT PRIMARY KEY,
        schema_version  INTEGER NOT NULL,
        submitted_at    TEXT NOT NULL,
        source_kind     TEXT NOT NULL,
        payload_json    TEXT NOT NULL
    )
"""


class PostingImportStore:
    def __init__(self, database_path: Path):
        self._database_path = database_path
        self._create_table()

    def _create_table(self) -> None:
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(_CREATE_POSTING_IMPORT_TABLE)
            connection.commit()
        finally:
            connection.close()