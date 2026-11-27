import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from uuid import UUID

from ..models.posting_source_check import PostingSourceCheck


class PostingSourceCheckStore:
    """Persist only the observation and its Card reference."""

    def __init__(self, database_path: Path):
        self._database_path = database_path
        with self.transaction(write=True) as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS posting_source_checks (
                    check_id TEXT PRIMARY KEY NOT NULL,
                    card_key TEXT NOT NULL REFERENCES posting_cards(card_key) ON DELETE CASCADE,
                    recorded_at TEXT NOT NULL,
                    result TEXT NOT NULL
                )
            """)
            connection.execute("""
                CREATE INDEX IF NOT EXISTS idx_posting_source_checks_card
                ON posting_source_checks(card_key, recorded_at, check_id)
            """)

    @contextmanager
    def transaction(self, *, write: bool = False) -> Iterator[sqlite3.Connection]:
        with closing(sqlite3.connect(self._database_path)) as connection, connection:
            if write:
                connection.execute("PRAGMA foreign_keys = ON")
            # A write reserves the lock before it reads eligibility or replay state.
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection

    @staticmethod
    def read_all(
        connection: sqlite3.Connection,
        card_key: UUID,
    ) -> tuple[PostingSourceCheck, ...]:
        rows = connection.execute(
            "SELECT check_id, recorded_at, result FROM posting_source_checks "
            "WHERE card_key = ? ORDER BY recorded_at DESC, check_id DESC",
            (str(card_key),),
        )
        return tuple(
            PostingSourceCheck(
                check_id=check_id, recorded_at=recorded_at, result=result
            )
            for check_id, recorded_at, result in rows
        )

    @staticmethod
    def read_by_id(
        connection: sqlite3.Connection,
        check_id: UUID,
    ) -> tuple[UUID, PostingSourceCheck] | None:
        row = connection.execute(
            "SELECT card_key, recorded_at, result FROM posting_source_checks WHERE check_id = ?",
            (str(check_id),),
        ).fetchone()
        if row is None:
            return None
        card_key, recorded_at, result = row
        check = PostingSourceCheck(
            check_id=check_id, recorded_at=recorded_at, result=result
        )
        return UUID(card_key), check

    @staticmethod
    def add(
        connection: sqlite3.Connection,
        card_key: UUID,
        check: PostingSourceCheck,
    ) -> None:
        connection.execute(
            "INSERT INTO posting_source_checks (check_id, card_key, recorded_at, result) "
            "VALUES (?, ?, ?, ?)",
            (
                str(check.check_id),
                str(card_key),
                check.recorded_at.isoformat(timespec="microseconds"),
                check.result,
            ),
        )
