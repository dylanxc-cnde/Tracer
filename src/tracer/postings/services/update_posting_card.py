from uuid import UUID

from ..models.posting_card import PostingCard
from ..stores.posting_card_store import PostingCardStore


class UpdatePostingCardService:
    """Update the user-owned fields of stored posting cards.

    Args:
        store: The posting card store to use.
    """

    def __init__(self, store: PostingCardStore):
        self._posting_card_store = store

    def update_user_content(
        self,
        card_key: UUID,
        posting_alias: str | None,
        user_notes: str | None,
        tags: tuple[str, ...],
    ) -> PostingCard | None:
        """Replace the user-owned fields of one posting card.

        Args:
            card_key: The posting card to update.
            posting_alias: The user's display name for the posting.
            user_notes: Notes written by the user.
            tags: Tags chosen by the user.

        Returns:
            The updated card, or None if it does not exist.
        """
        card = self._posting_card_store.get_by_card_key(card_key)
        if card is None:
            return None

        updated_card = PostingCard.model_validate(
            {
                **card.model_dump(),
                "posting_alias": posting_alias,
                "user_notes": user_notes,
                "tags": tags,
            }
        )

        if not self._posting_card_store.update(updated_card):
            return None

        return updated_card
