from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict

from .posting_source_check import PostingSourceCheckResult


class LatestSourceCheck(BaseModel):
    """The result and time of a manual observation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    result: PostingSourceCheckResult
    recorded_at: AwareDatetime


class WatchedPostingCard(BaseModel):
    """An explicit watch membership for a saved Card."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    card_key: UUID
    watch_id: UUID
    watched_at: AwareDatetime
    last_source_check: LatestSourceCheck | None
