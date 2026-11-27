from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict

from .posting_source_check import PostingSourceCheckResult


class LatestSourceCheck(BaseModel):
    """The result and time of a manual observation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    result: PostingSourceCheckResult
    recorded_at: AwareDatetime


class WatchedPostingCard(BaseModel):
    """A locally watched Card and the time this membership began."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    card_key: UUID
    watched_at: AwareDatetime
    last_source_check: LatestSourceCheck | None
