from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .posting_source_check import PostingSourceCheckResult


class LatestSourceCheck(BaseModel):
    """The result and time of a manual observation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    result: PostingSourceCheckResult
    recorded_at: AwareDatetime


class WatchedCardIdentity(BaseModel):
    """Display facts from the current saved Card."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    posting_alias: str | None
    position_title: str | None
    company_name: str | None


class WatchedPostingCard(BaseModel):
    """An explicit watch membership for a saved Card."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    card_key: UUID
    watch_id: UUID
    watched_at: AwareDatetime
    last_source_check: LatestSourceCheck | None
    card_identity: WatchedCardIdentity | None
    last_source_check_unavailable: bool = Field(
        default=False, exclude_if=lambda unavailable: not unavailable
    )
