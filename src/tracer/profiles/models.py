from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from tracer.postings.models.posting_details import RequirementImportance


Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
EvidenceKind = Literal["qualification", "skill", "language", "experience", "certificate"]
ConstraintKind = Literal["work_type", "location", "office", "hours", "salary", "availability"]


class LocalModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class EvidenceInput(LocalModel):
    evidence_id: UUID | None = None
    kind: EvidenceKind
    label: Text
    description: Text | None = None


class ConfirmedEvidence(LocalModel):
    evidence_id: UUID
    kind: EvidenceKind
    label: Text
    description: Text | None


class SaveProfileRequest(LocalModel):
    expected_revision: int = Field(ge=0, strict=True)
    evidence: tuple[EvidenceInput, ...] = ()


class CandidateProfile(LocalModel):
    profile_id: UUID
    revision: int
    confirmed_at: datetime
    evidence: tuple[ConfirmedEvidence, ...]


class ConstraintInput(LocalModel):
    constraint_id: UUID | None = None
    kind: ConstraintKind
    label: Text
    description: Text | None = None
    importance: RequirementImportance = RequirementImportance.UNKNOWN


class ConfirmedConstraint(LocalModel):
    constraint_id: UUID
    kind: ConstraintKind
    label: Text
    description: Text | None
    importance: RequirementImportance


class SaveGoalRequest(LocalModel):
    expected_revision: int = Field(ge=0, strict=True)
    objective: Text | None = None
    constraints: tuple[ConstraintInput, ...] = ()


class JobSearchGoal(LocalModel):
    goal_id: UUID
    revision: int
    confirmed_at: datetime
    objective: Text | None
    constraints: tuple[ConfirmedConstraint, ...]
