from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from ..models.posting_source_check import PostingSourceCheck, PostingSourceCheckResult
from ..stores.posting_card_store import PostingCardStore
from ..stores.posting_import_request_store import PostingImportRequestStore
from ..stores.posting_source_check_store import PostingSourceCheckStore


class SourceCheckConflict(ValueError):
    """The check ID belongs to a different observation."""


class SourceCheckUnavailable(ValueError):
    """The Card has no submitted link available for a new observation."""


class PostingSourceCheckService:
    def __init__(self, database_path: Path):
        self._store = PostingSourceCheckStore(database_path)

    def list_for_card(self, card_key: UUID) -> tuple[PostingSourceCheck, ...] | None:
        with self._store.transaction() as connection:
            if PostingCardStore.read_import_key(connection, card_key) is None:
                return None
            return self._store.read_all(connection, card_key)

    def record(
        self,
        card_key: UUID,
        check_id: UUID,
        result: PostingSourceCheckResult,
    ) -> tuple[PostingSourceCheck, bool] | None:
        """Return the observation and whether it was created, or None for a missing Card."""
        with self._store.transaction(write=True) as connection:
            import_key = PostingCardStore.read_import_key(connection, card_key)
            if import_key is None:
                return None

            previous = self._store.read_by_id(connection, check_id)
            if previous is not None:
                previous_card_key, check = previous
                if previous_card_key != card_key or check.result != result:
                    raise SourceCheckConflict()
                return check, False

            receipt = PostingImportRequestStore.read(connection, import_key)
            if receipt is None or receipt.source_url is None:
                raise SourceCheckUnavailable()

            check = PostingSourceCheck(
                check_id=check_id, recorded_at=datetime.now(UTC), result=result
            )
            self._store.add(connection, card_key, check)
            return check, True
