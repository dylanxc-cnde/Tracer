import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from ..models.posting_watchlist import LatestSourceCheck, WatchedPostingCard


_SELECT_WATCHED_CARDS = """
    SELECT watch.card_key, watch.watched_at, latest.result, latest.recorded_at
    FROM posting_watchlist AS watch
    LEFT JOIN posting_source_checks AS latest ON latest.check_id = (
        SELECT check_id FROM posting_source_checks
        WHERE card_key = watch.card_key
        ORDER BY recorded_at DESC, check_id DESC
        LIMIT 1
    )
"""


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
                _SELECT_WATCHED_CARDS
                + " ORDER BY watch.watched_at DESC, watch.card_key DESC"
            ).fetchall()
        return tuple(self._to_card(row) for row in rows)

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
                _SELECT_WATCHED_CARDS + " WHERE watch.card_key = ?",
                (key,),
            ).fetchone()
            return self._to_card(row) if row is not None else None

    @staticmethod
    def _to_card(row: tuple[str, str, str | None, str | None]) -> WatchedPostingCard:
        card_key, watched_at, result, recorded_at = row
        observation = None
        if result is not None:
            observation = LatestSourceCheck.model_validate(
                {"result": result, "recorded_at": recorded_at}
            )
        return WatchedPostingCard(
            card_key=UUID(card_key),
            watched_at=datetime.fromisoformat(watched_at),
            last_source_check=observation,
        )

    def unwatch(self, card_key: UUID) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM posting_watchlist WHERE card_key = ?", (str(card_key),)
            )
