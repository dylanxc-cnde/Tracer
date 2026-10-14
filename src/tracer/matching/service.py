import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from tracer.postings.models.posting_card import PostingCard
from tracer.postings.models.posting_details import (
    PostingDetails, RequirementImportance, RequirementItemRule,
)
from tracer.profiles.models import CandidateProfile, JobSearchGoal
from tracer.profiles.store import InvalidReference, ProfileStore, RevisionConflict

from .models import (
    RULE_REVISION, EvaluateMatchRequest, EvidenceCoverage, GroupResult, Judgment,
    MatchGroup, MatchInputs, MatchRecord, MatchStatus, MatchSummary, MatchTarget,
    MatchView, SaveJudgmentRequest,
)
from .store import MatchStore


class CardNotFound(LookupError):
    pass


def aggregate_status(rule: RequirementItemRule, statuses: tuple[MatchStatus, ...]) -> MatchStatus:
    """Combine only core items; uncertainty is never an inferred failure."""
    if not statuses or rule == RequirementItemRule.UNKNOWN:
        return "unknown"
    applicable = tuple(status for status in statuses if status != "not_applicable")
    if not applicable:
        return "not_applicable"
    if rule == RequirementItemRule.ANY_OF:
        if "met" in applicable:
            return "met"
        if all(status == "missing" for status in applicable):
            return "missing"
        if "unknown" in applicable:
            return "unknown"
        return "partial"
    if "missing" in applicable:
        return "missing"
    if all(status == "met" for status in applicable):
        return "met"
    if "unknown" in applicable:
        return "unknown"
    return "partial"


def summarize(groups: tuple[MatchGroup, ...], judgments: tuple[Judgment, ...]) -> MatchSummary:
    by_target = {judgment.target_id: judgment for judgment in judgments}
    results = []
    for group in groups:
        core = tuple(by_target[target.target_id] for target in group.targets if not target.is_example)
        importance = group.importance
        if group.dimension == "qualification" and core and core[0].confirmed_importance is not None:
            importance = core[0].confirmed_importance
        results.append(GroupResult(
            group_id=group.group_id, dimension=group.dimension, importance=importance,
            status=aggregate_status(group.item_rule, tuple(judgment.status for judgment in core)),
        ))
    return MatchSummary(
        groups=tuple(results),
        qualification_warnings=tuple(result.group_id for result in results if
            result.dimension == "qualification" and result.importance == RequirementImportance.REQUIRED
            and result.status == "missing"),
        capability_gaps=tuple(result.group_id for result in results if
            result.dimension == "capability" and result.status in {"missing", "partial"}),
        preference_conflicts=tuple(result.group_id for result in results if
            result.dimension == "preference" and result.status in {"missing", "partial"}),
        evidence_coverage=EvidenceCoverage(
            total=len(judgments),
            linked=sum(bool(judgment.evidence) and judgment.status in {"met", "partial", "missing"}
                       for judgment in judgments),
            unknown=sum(judgment.status == "unknown" for judgment in judgments),
            explicitly_not_applicable=sum(judgment.status == "not_applicable" for judgment in judgments),
        ),
    )


def fingerprint(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class MatchService:
    """Read snapshots and write reviews in one SQLite transaction, with no inference."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    @staticmethod
    def _inputs(connection: sqlite3.Connection, card_key: UUID) -> tuple[
        MatchInputs, PostingDetails, CandidateProfile | None, JobSearchGoal | None,
    ]:
        # Read the existing table directly: constructing PostingCardStore here
        # would run unrelated DDL and use a second, non-atomic connection.
        row = connection.execute(
            "SELECT payload_json FROM posting_cards WHERE card_key=?", (str(card_key),)
        ).fetchone()
        if row is None:
            raise CardNotFound()
        card = PostingCard.model_validate_json(row[0])
        profile = ProfileStore.read(connection, "profile")
        goal = ProfileStore.read(connection, "goal")
        posting_revision = fingerprint(card.posting.model_dump(mode="json"))
        versions = {
            "card_key": str(card_key), "posting_revision": posting_revision,
            "profile_id": str(profile.profile_id) if profile else None,
            "profile_revision": profile.revision if profile else 0,
            "goal_id": str(goal.goal_id) if goal else None,
            "goal_revision": goal.revision if goal else 0, "rule_revision": RULE_REVISION,
        }
        inputs = MatchInputs(
            fingerprint=fingerprint(versions), posting_revision=posting_revision,
            profile_revision=versions["profile_revision"], goal_revision=versions["goal_revision"],
            rule_revision=RULE_REVISION,
        )
        return inputs, card.posting, profile, goal

    @staticmethod
    def _view(inputs: MatchInputs | None, record: MatchRecord | None) -> MatchView:
        reasons = []
        if record:
            if inputs is None:
                reasons.append("card_missing")
            else:
                for label, field in (("posting", "posting_revision"), ("profile", "profile_revision"),
                                     ("goal", "goal_revision"), ("rules", "rule_revision")):
                    if getattr(record.inputs, field) != getattr(inputs, field):
                        reasons.append(label)
        return MatchView(current_inputs=inputs, match=record, stale=bool(reasons), stale_reasons=tuple(reasons))

    def get(self, card_key: UUID) -> MatchView:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN")
            inputs, _, _, _ = self._inputs(connection, card_key)
            records = MatchStore.read_all(connection, card_key)
            return self._view(inputs, records[0] if records else None)

    def history(self, card_key: UUID) -> tuple[MatchView, ...]:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN")
            records = MatchStore.read_all(connection, card_key)
            try:
                inputs, _, _, _ = self._inputs(connection, card_key)
            except CardNotFound:
                if not records:
                    raise
                inputs = None
            return tuple(self._view(inputs, record) for record in records)

    @staticmethod
    def _groups(posting: PostingDetails, goal: JobSearchGoal | None) -> tuple[MatchGroup, ...]:
        groups = []

        def add(dimension, label, importance, rule, targets):
            groups.append(MatchGroup(
                group_id=uuid4(), dimension=dimension, label=label,
                importance=importance, item_rule=rule, targets=tuple(targets),
            ))

        eligibility = posting.classification.eligibility
        add("qualification", "Applicant eligibility", RequirementImportance.UNKNOWN,
            RequirementItemRule.ALL_OF, [MatchTarget(
                target_id=uuid4(), label=eligibility.value if eligibility else "Eligibility not stated",
                posting_available=bool(eligibility and eligibility.value.strip()),
            )])
        for requirement in posting.requirements.groups:
            add("capability", "Capability requirements", requirement.importance, requirement.item_rule,
                [MatchTarget(target_id=uuid4(), label=item.name, category=item.category,
                             is_example=item.is_example,
                             posting_available=bool(item.name.strip())) for item in requirement.items])
        if not posting.requirements.groups:
            add("capability", "Capability requirements", RequirementImportance.UNKNOWN,
                RequirementItemRule.ALL_OF, [MatchTarget(
                    target_id=uuid4(), label="Requirements not stated", posting_available=False,
                )])
        conditions = posting.work_conditions
        # Presence only, never semantic compatibility or a guessed numeric match.
        available = {
            "work_type": bool((posting.classification.role_families and posting.classification.role_families.value)
                              or posting.classification.workload_type),
            "location": bool((conditions.primary_address and conditions.primary_address.value.strip())
                             or conditions.address_candidates),
            "office": bool(conditions.work_modes and conditions.work_modes.value),
            "hours": bool((conditions.weekly_hours and (
                conditions.weekly_hours.minimum is not None or conditions.weekly_hours.maximum is not None
            )) or (conditions.schedule and conditions.schedule.value.strip())),
            "salary": any(entry.minimum_amount is not None or entry.maximum_amount is not None
                          or (entry.payment_conditions and entry.payment_conditions.strip())
                          for entry in posting.compensation.entries),
            "availability": bool(conditions.start_on or (conditions.duration and conditions.duration.value.strip())),
        }
        if goal and goal.constraints:
            for constraint in goal.constraints:
                add("preference", constraint.kind, constraint.importance, RequirementItemRule.ALL_OF,
                    [MatchTarget(target_id=uuid4(), label=constraint.label,
                                 posting_available=available[constraint.kind],
                                 constraint_id=constraint.constraint_id)])
        else:
            add("preference", "Search constraints", RequirementImportance.UNKNOWN,
                RequirementItemRule.ALL_OF, [MatchTarget(
                    target_id=uuid4(), label="No search constraints confirmed", posting_available=False,
                )])
        return tuple(groups)

    def evaluate(self, card_key: UUID, request: EvaluateMatchRequest) -> MatchView:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            inputs, posting, profile, goal = self._inputs(connection, card_key)
            if request.expected_inputs != inputs.fingerprint:
                raise RevisionConflict()
            records = MatchStore.read_all(connection, card_key)
            if records and records[0].inputs == inputs:
                return self._view(inputs, records[0])
            groups = self._groups(posting, goal)
            judgments = tuple(Judgment(
                judgment_id=uuid4(), target_id=target.target_id, status="unknown", reason=None,
                evidence=(), confirmed_importance=None, confirmed_at=None,
            ) for group in groups for target in group.targets)
            now = datetime.now(timezone.utc)
            record = MatchRecord(
                match_id=uuid4(), card_key=card_key, version=records[0].version + 1 if records else 1,
                revision=1, created_at=now, updated_at=now, inputs=inputs,
                posting_snapshot=posting, profile_snapshot=profile, goal_snapshot=goal,
                groups=groups, judgments=judgments, summary=summarize(groups, judgments),
            )
            MatchStore.append(connection, record)
            return self._view(inputs, record)

    def save_judgment(
        self, card_key: UUID, match_id: UUID, target_id: UUID, request: SaveJudgmentRequest,
    ) -> MatchView:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            inputs, _, profile, goal = self._inputs(connection, card_key)
            records = MatchStore.read_all(connection, card_key)
            if not records or records[0].match_id != match_id:
                raise RevisionConflict()
            record = records[0]
            if (record.inputs != inputs or request.expected_inputs != inputs.fingerprint
                    or request.expected_revision != record.revision):
                raise RevisionConflict()
            located = [(group, target) for group in record.groups for target in group.targets
                       if target.target_id == target_id]
            if not located:
                raise InvalidReference()
            group, target = located[0]
            if request.confirmed_importance is not None and group.dimension != "qualification":
                raise InvalidReference()
            if request.confirmed_importance is not None and not request.reason:
                raise InvalidReference()
            if not target.posting_available and request.status in {"met", "partial", "missing"}:
                raise InvalidReference()
            profile_entries = {entry.evidence_id: entry for entry in profile.evidence} if profile else {}
            goal_entries = {entry.constraint_id: entry for entry in goal.constraints} if goal else {}
            for ref in request.evidence:
                if ref.kind == "profile":
                    entry = profile_entries.get(ref.entry_id)
                    if entry is None or group.dimension == "preference":
                        raise InvalidReference()
                    if (group.dimension == "qualification") != (entry.kind == "qualification"):
                        raise InvalidReference()
                elif ref.entry_id not in goal_entries or group.dimension != "preference" or ref.entry_id != target.constraint_id:
                    raise InvalidReference()
            judgments = tuple(Judgment(
                judgment_id=judgment.judgment_id, target_id=target_id, status=request.status,
                reason=request.reason, evidence=request.evidence,
                confirmed_importance=request.confirmed_importance,
                confirmed_at=datetime.now(timezone.utc),
            ) if judgment.target_id == target_id else judgment for judgment in record.judgments)
            updated = record.model_copy(update={
                "revision": record.revision + 1, "updated_at": datetime.now(timezone.utc),
                "judgments": judgments, "summary": summarize(record.groups, judgments),
            })
            MatchStore.append(connection, updated)
            return self._view(inputs, updated)
