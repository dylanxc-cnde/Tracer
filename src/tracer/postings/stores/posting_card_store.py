import sqlite3
from pathlib import Path
from uuid import UUID

from ..models.posting_card import PostingCard


_CREATE_POSTING_CARD_TABLE = """
    CREATE TABLE IF NOT EXISTS posting_cards (
        card_key       TEXT PRIMARY KEY,
        import_key     TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at     TEXT NOT NULL,
        company_name   TEXT,
        position_title TEXT,
        payload_json   TEXT NOT NULL
    )
"""

_CREATE_POSTING_CARD_IMPORT_KEY_INDEX = """
    CREATE INDEX IF NOT EXISTS idx_posting_cards_import_key
    ON posting_cards(import_key)
"""

_INSERT_POSTING_CARD = """
    INSERT INTO posting_cards(
        card_key,
        import_key,
        schema_version,
        created_at,
        company_name,
        position_title,
        payload_json
    )
    VALUES(?, ?, ?, ?, ?, ?, ?)
"""

_SELECT_POSTING_CARD_BY_CARD_KEY = """
    SELECT payload_json
    FROM posting_cards
    WHERE card_key = ?
"""

_SELECT_POSTING_CARDS_BY_IMPORT_KEY = """
    SELECT payload_json
    FROM posting_cards
    WHERE import_key = ?
    ORDER BY created_at, card_key
"""

_CHECK_POSTING_CARD_EXISTS = """
    SELECT 1
    FROM posting_cards
    WHERE card_key = ?
    LIMIT 1
"""


class PostingCardStore:
    """SQLite store for confirmed posting cards.

    Args:
        database_path: The SQLite database file to use.
    """

    def __init__(self, database_path: Path):
        self._database_path = database_path
        self._create_table()

    def _create_table(self) -> None:
        """Create the posting card table and indexes if needed."""
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(_CREATE_POSTING_CARD_TABLE)
            connection.execute(_CREATE_POSTING_CARD_IMPORT_KEY_INDEX)
            connection.commit()
        finally:
            connection.close()

    def add(self, card: PostingCard) -> None:
        """Store one confirmed posting card.

        Args:
            card: The posting card to store.
        """
        company_name = card.posting.identity.company_name
        position_title = card.posting.identity.position_title
        connection = sqlite3.connect(self._database_path)

        try:
            connection.execute(
                _INSERT_POSTING_CARD,
                (
                    str(card.card_key),
                    str(card.import_key),
                    card.schema_version,
                    card.created_at.isoformat(),
                    company_name.value if company_name is not None else None,
                    position_title.value if position_title is not None else None,
                    card.model_dump_json(),
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def get_by_card_key(
        self,
        card_key: UUID,
    ) -> PostingCard | None:
        """Get one card by its unique card key.

        Args:
            card_key: The posting card to find.

        Returns:
            The stored card, or None if it does not exist.
        """
        connection = sqlite3.connect(self._database_path)

        try:
            row = connection.execute(
                _SELECT_POSTING_CARD_BY_CARD_KEY,
                (str(card_key),),
            ).fetchone()
        finally:
            connection.close()

        if row is None:
            return None

        return PostingCard.model_validate_json(row[0])

    def get_by_import_key(
        self,
        import_key: UUID,
    ) -> tuple[PostingCard, ...]:
        """Get all cards created from one import request.

        Args:
            import_key: The source import request to find cards for.

        Returns:
            Stored cards ordered by creation time and card key.
        """
        connection = sqlite3.connect(self._database_path)

        try:
            rows = connection.execute(
                _SELECT_POSTING_CARDS_BY_IMPORT_KEY,
                (str(import_key),),
            ).fetchall()
        finally:
            connection.close()

        return tuple(
            PostingCard.model_validate_json(row[0])
            for row in rows
        )

    def exists(self, card_key: UUID) -> bool:
        """Check whether a posting card is stored.

        Args:
            card_key: The posting card to find.

        Returns:
            True if the card exists, otherwise False.
        """
        connection = sqlite3.connect(self._database_path)

        try:
            row = connection.execute(
                _CHECK_POSTING_CARD_EXISTS,
                (str(card_key),),
            ).fetchone()
        finally:
            connection.close()

        return row is not None
