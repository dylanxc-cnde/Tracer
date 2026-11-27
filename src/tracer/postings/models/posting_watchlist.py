from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict


class WatchedPostingCard(BaseModel):
    """A locally watched Card and the time this membership began."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    card_key: UUID
    watched_at: AwareDatetime
