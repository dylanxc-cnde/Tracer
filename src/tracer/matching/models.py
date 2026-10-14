from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from tracer.postings.models.posting_details import (
    PostingDetails, RequirementCategory, RequirementImportance, RequirementItemRule,
)
from tracer.profiles.models import CandidateProfile, JobSearchGoal, LocalModel, Text


MatchStatus = Literal["met", "partial", "missing", "unknown", "not_applicable"]
Dimension = Literal["qualification", "capability", "preference"]
RULE_REVISION = "local-review-v1"


class MatchInputs(LocalModel):
    fingerprint: str
    posting_revision: str
    profile_revision: int
    goal_revision: int
    rule_revision: str


class EvidenceReference(LocalModel):
    kind: Literal["profile", "goal"]
    entry_id: UUID


class MatchTarget(LocalModel):
    target_id: UUID
    label: str
    is_example: bool = False
    posting_available: bool
    constraint_id: UUID | None = None
    category: RequirementCategory | None = None


class MatchGroup(LocalModel):
    group_id: UUID
    dimension: Dimension
    label: str
    importance: RequirementImportance
    item_rule: RequirementItemRule
    targets: tuple[MatchTarget, ...]


class Judgment(LocalModel):
    judgment_id: UUID
    target_id: UUID
    status: MatchStatus
    reason: Text | None
    evidence: tuple[EvidenceReference, ...]
    # Eligibility is free text: only the user can confirm its priority.
    confirmed_importance: RequirementImportance | None
    confirmed_at: datetime | None


class SaveJudgmentRequest(LocalModel):
    expected_inputs: str
    expected_revision: int = Field(ge=1, strict=True)
    status: MatchStatus
    reason: Text | None = None
    evidence: tuple[EvidenceReference, ...] = ()
    confirmed_importance: RequirementImportance | None = None

    @model_validator(mode="after")
    def require_basis(self) -> "SaveJudgmentRequest":
        if self.status != "unknown" and not self.reason:
            raise ValueError("An explicit reason is required for a confirmed judgment")
        if self.status in {"met", "partial", "missing"} and not self.evidence:
            raise ValueError("Confirmed judgments require linked confirmed evidence")
        if len(self.evidence) != len(set((ref.kind, ref.entry_id) for ref in self.evidence)):
            raise ValueError("Evidence references must be unique")
        return self


class EvaluateMatchRequest(LocalModel):
    expected_inputs: str


class GroupResult(LocalModel):
    group_id: UUID
    dimension: Dimension
    importance: RequirementImportance
    status: MatchStatus


class EvidenceCoverage(LocalModel):
    total: int
    linked: int
    unknown: int
    explicitly_not_applicable: int


class MatchSummary(LocalModel):
    groups: tuple[GroupResult, ...]
    qualification_warnings: tuple[UUID, ...]
    capability_gaps: tuple[UUID, ...]
    preference_conflicts: tuple[UUID, ...]
    evidence_coverage: EvidenceCoverage


class MatchRecord(LocalModel):
    match_id: UUID
    card_key: UUID
    version: int
    revision: int
    created_at: datetime
    updated_at: datetime
    mode: Literal["local_review"] = "local_review"
    inputs: MatchInputs
    posting_snapshot: PostingDetails
    profile_snapshot: CandidateProfile | None
    goal_snapshot: JobSearchGoal | None
    groups: tuple[MatchGroup, ...]
    judgments: tuple[Judgment, ...]
    summary: MatchSummary


class MatchView(LocalModel):
    current_inputs: MatchInputs | None
    match: MatchRecord | None
    stale: bool
    stale_reasons: tuple[Literal["posting", "profile", "goal", "rules", "card_missing"], ...]
