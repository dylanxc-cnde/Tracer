from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from tracer.postings.card_models import PostingCard
from tracer.postings.posting_details_models import PostingDetails


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")


def make_posting_details() -> PostingDetails:
    return PostingDetails(
        identity={},
        company={},
        classification={},
        work_conditions={},
        role_content={},
        requirements=[],
        compensation={},
        application_instructions={},
        contact=None,
    )


def test_posting_card_adds_system_and_user_fields():
    created_at = datetime(
        2026,
        8,
        15,
        18,
        30,
        tzinfo=timezone(timedelta(hours=2)),
    )

    card = PostingCard(
        import_key=IMPORT_KEY,
        created_at=created_at,
        posting=make_posting_details(),
        posting_alias="Thermondo München",
        user_notes="Check travel area.",
        tags=["priority"],
    )

    assert card.import_key == IMPORT_KEY
    assert isinstance(card.posting_key, UUID)
    assert card.created_at == datetime(2026, 8, 15, 16, 30, tzinfo=UTC)
    assert card.posting_alias == "Thermondo München"
    assert card.user_notes == "Check travel area."
    assert card.tags == ("priority",)


def test_posting_card_json_round_trip_preserves_posting():
    card = PostingCard(
        import_key=IMPORT_KEY,
        posting=make_posting_details(),
    )

    restored = PostingCard.model_validate_json(card.model_dump_json())

    assert restored == card


def test_posting_card_rejects_naive_created_time():
    with pytest.raises(ValidationError, match="timezone is required"):
        PostingCard(
            import_key=IMPORT_KEY,
            created_at=datetime(2026, 8, 15, 18, 30),
            posting=make_posting_details(),
        )
