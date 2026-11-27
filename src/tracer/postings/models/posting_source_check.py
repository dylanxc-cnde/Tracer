from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict

PostingSourceCheckResult = Literal["listed", "not_listed", "unable_to_confirm"]


class PostingSourceCheck(BaseModel):
    """One manually recorded observation about a supplied posting source."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    check_id: UUID
    recorded_at: AwareDatetime
    result: PostingSourceCheckResult
