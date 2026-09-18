from typing import TYPE_CHECKING
from uuid import UUID

from ..models.posting_card import PostingCard
from ..models.posting_details import FactOrigin
from ..stores.posting_card_store import PostingCardStore

if TYPE_CHECKING:
    from tracer.api.models import UpdatePostingCardRequest


class UpdatePostingCardService:
    """Update the editable content of stored posting cards.

    Args:
        store: The posting card store to use.
    """

    def __init__(self, store: PostingCardStore):
        self._posting_card_store = store

    def update_user_content(
        self,
        card_key: UUID,
        request: "UpdatePostingCardRequest",
    ) -> PostingCard | None:
        """Update allowed fields while preserving sources and card metadata.

        Args:
            card_key: The posting card to update.
            request: The editable content submitted by the user.

        Returns:
            The updated card, or None if it does not exist.
        """
        card = self._posting_card_store.get_by_card_key(card_key)
        if card is None:
            return None

        original_card = self._posting_card_store.get_original_by_card_key(card_key)
        if original_card is None:
            return None

        payload = card.model_dump()
        saved_summary = card.posting.role_content.role_summary
        saved_summary_value = (
            saved_summary.value if saved_summary is not None else None
        )

        if request.role_summary != saved_summary_value:
            if request.role_summary is None:
                payload["posting"]["role_content"]["role_summary"] = None
            else:
                original_summary = original_card.posting.role_content.role_summary
                origin = FactOrigin.USER_DEFINED
                if (
                    original_summary is not None
                    and request.role_summary == original_summary.value
                ):
                    origin = original_summary.origin

                payload["posting"]["role_content"]["role_summary"] = {
                    "value": request.role_summary,
                    "origin": origin,
                }

        saved_responsibilities = tuple(
            responsibility.value
            for responsibility in card.posting.role_content.responsibilities
        )
        if request.responsibilities != saved_responsibilities:
            updated_responsibilities = []
            original_responsibilities = (
                original_card.posting.role_content.responsibilities
            )

            for value in request.responsibilities:
                origin = FactOrigin.USER_DEFINED
                for original_responsibility in original_responsibilities:
                    if value == original_responsibility.value:
                        origin = original_responsibility.origin
                        break

                updated_responsibilities.append({"value": value, "origin": origin})

            payload["posting"]["role_content"]["responsibilities"] = (
                updated_responsibilities
            )

        saved_benefits = tuple(
            benefit.value for benefit in card.posting.compensation.benefits
        )
        if request.benefits != saved_benefits:
            updated_benefits = []
            original_benefits = original_card.posting.compensation.benefits

            for value in request.benefits:
                origin = FactOrigin.USER_DEFINED
                for original_benefit in original_benefits:
                    if value == original_benefit.value:
                        origin = original_benefit.origin
                        break

                updated_benefits.append({"value": value, "origin": origin})

            payload["posting"]["compensation"]["benefits"] = updated_benefits

        payload["posting_alias"] = request.posting_alias
        payload["user_notes"] = request.user_notes
        payload["tags"] = request.tags
        updated_card = PostingCard.model_validate(payload)

        if not self._posting_card_store.update(updated_card):
            return None

        return updated_card
