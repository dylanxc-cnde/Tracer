from uuid import UUID

from ..models.posting_card import PostingCard
from ..models.posting_details import PostingDetails
from ..stores.posting_card_store import PostingCardStore


class CreatePostingCardService:
    """Create and store user-confirmed posting cards.

    Args:
        store: The posting card store to use.
    """

    def __init__(self, store: PostingCardStore):
        self._posting_card_store = store

    def create(
        self,
        import_key: UUID,
        posting: PostingDetails,
        posting_alias: str | None = None,
        user_notes: str | None = None,
        tags: tuple[str, ...] = (),
    ) -> PostingCard:
        """Create and store one confirmed posting card.

        Args:
            import_key: The import request that produced the posting.
            posting: The posting details confirmed by the user.
            posting_alias: An optional name chosen by the user.
            user_notes: Optional notes written by the user.
            tags: Optional tags chosen by the user.

        Returns:
            The stored posting card.
        """
        card = PostingCard(
            import_key=import_key,
            posting=posting,
            posting_alias=posting_alias,
            user_notes=user_notes,
            tags=tags,
        )
        self._posting_card_store.add(card)

        return card
