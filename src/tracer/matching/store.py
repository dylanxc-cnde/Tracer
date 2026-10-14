import sqlite3
from pathlib import Path
from uuid import UUID

from .models import MatchRecord


class MatchStore:
    """Keep every evaluation and judgment revision; never alter Card payloads."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    @staticmethod
    def read_all(connection: sqlite3.Connection, card_key: UUID) -> tuple[MatchRecord, ...]:
        if not connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='match_revisions'"
        ).fetchone():
            return ()
        rows = connection.execute(
            "SELECT payload_json FROM match_revisions WHERE card_key=? "
            "ORDER BY version DESC, revision DESC", (str(card_key),)
        ).fetchall()
        return tuple(MatchRecord.model_validate_json(row[0]) for row in rows)

    @staticmethod
    def append(connection: sqlite3.Connection, record: MatchRecord) -> None:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS match_revisions (
                match_id TEXT NOT NULL,
                card_key TEXT NOT NULL,
                version INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY(match_id, revision),
                UNIQUE(card_key, version, revision)
            )
        """)
        connection.execute(
            "INSERT INTO match_revisions VALUES(?,?,?,?,?)",
            (str(record.match_id), str(record.card_key), record.version,
             record.revision, record.model_dump_json()),
        )
