import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from ..models.posting_watchlist import WatchedPostingCard


class PostingWatchlistStore:
    """Manage explicit watch membership for existing saved Cards."""

    def __init__(self, database_path: Path):
        self._database_path = database_path
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS posting_watchlist (
                    card_key TEXT PRIMARY KEY NOT NULL
                        REFERENCES posting_cards(card_key) ON DELETE CASCADE,
                    watched_at TEXT NOT NULL
                )
            """)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        with closing(sqlite3.connect(self._database_path)) as connection, connection:
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection

    def list_watched(self) -> tuple[WatchedPostingCard, ...]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT card_key, watched_at FROM posting_watchlist "
                "ORDER BY watched_at DESC, card_key DESC"
            ).fetchall()
        return tuple(
            WatchedPostingCard(card_key=card_key, watched_at=watched_at)
            for card_key, watched_at in rows
        )

    def watch(self, card_key: UUID) -> WatchedPostingCard | None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            key = str(card_key)
            watched_at = datetime.now(UTC).isoformat(timespec="microseconds")
            connection.execute(
                "INSERT INTO posting_watchlist (card_key, watched_at) "
                "SELECT card_key, ? FROM posting_cards WHERE card_key = ? "
                "ON CONFLICT(card_key) DO NOTHING",
                (watched_at, key),
            )
            row = connection.execute(
                "SELECT watched_at FROM posting_watchlist WHERE card_key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        return WatchedPostingCard(card_key=card_key, watched_at=row[0])

    def unwatch(self, card_key: UUID) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM posting_watchlist WHERE card_key = ?", (str(card_key),)
            )
