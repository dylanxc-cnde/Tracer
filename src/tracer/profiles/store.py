import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from .models import (
    CandidateProfile,
    ConfirmedConstraint,
    ConfirmedEvidence,
    JobSearchGoal,
    SaveGoalRequest,
    SaveProfileRequest,
)


class RevisionConflict(ValueError):
    """The caller must refresh saved state before another explicit write."""


class InvalidReference(ValueError):
    """A supplied stable identity does not belong to the current document."""


class ProfileStore:
    """Append-only singleton revisions; construction and reads never create tables."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    @staticmethod
    def create_table(connection: sqlite3.Connection) -> None:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS personal_revisions (
                kind TEXT NOT NULL,
                revision INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY(kind, revision)
            )
        """)

    @staticmethod
    def read(
        connection: sqlite3.Connection, kind: Literal["profile", "goal"]
    ) -> CandidateProfile | JobSearchGoal | None:
        if not connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='personal_revisions'"
        ).fetchone():
            return None
        row = connection.execute(
            "SELECT payload_json FROM personal_revisions WHERE kind=? "
            "ORDER BY revision DESC LIMIT 1", (kind,)
        ).fetchone()
        if row is None:
            return None
        model = CandidateProfile if kind == "profile" else JobSearchGoal
        return model.model_validate_json(row[0])

    def get_profile(self) -> CandidateProfile | None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            return self.read(connection, "profile")

    def get_goal(self) -> JobSearchGoal | None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            return self.read(connection, "goal")

    def save_profile(self, request: SaveProfileRequest) -> CandidateProfile:
        return self._save("profile", request)

    def save_goal(self, request: SaveGoalRequest) -> JobSearchGoal:
        return self._save("goal", request)

    def _save(
        self, kind: Literal["profile", "goal"],
        request: SaveProfileRequest | SaveGoalRequest,
    ) -> CandidateProfile | JobSearchGoal:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            # Reserve the write before reading the expected revision, including
            # concurrent match writes that reference these exact confirmed facts.
            connection.execute("BEGIN IMMEDIATE")
            current = self.read(connection, kind)
            revision = current.revision if current else 0
            if request.expected_revision != revision:
                raise RevisionConflict()
            is_profile = kind == "profile"
            entries = request.evidence if is_profile else request.constraints
            old_entries = (current.evidence if is_profile else current.constraints) if current else ()
            id_field = "evidence_id" if is_profile else "constraint_id"
            known = {getattr(entry, id_field) for entry in old_entries}
            supplied = [getattr(entry, id_field) for entry in entries if getattr(entry, id_field)]
            if len(supplied) != len(set(supplied)) or not set(supplied) <= known:
                raise InvalidReference()
            entry_model = ConfirmedEvidence if is_profile else ConfirmedConstraint
            confirmed = tuple(entry_model.model_validate({
                **entry.model_dump(), id_field: getattr(entry, id_field) or uuid4(),
            }) for entry in entries)
            now = datetime.now(timezone.utc)
            if is_profile:
                document = CandidateProfile(
                    profile_id=current.profile_id if current else uuid4(),
                    revision=revision + 1, confirmed_at=now, evidence=confirmed,
                )
                same = current and current.evidence == confirmed
            else:
                document = JobSearchGoal(
                    goal_id=current.goal_id if current else uuid4(),
                    revision=revision + 1, confirmed_at=now,
                    objective=request.objective, constraints=confirmed,
                )
                same = current and current.constraints == confirmed and current.objective == request.objective
            # An identical explicit save does not stale a valid assessment.
            if same:
                return current
            self.create_table(connection)
            connection.execute(
                "INSERT INTO personal_revisions(kind, revision, payload_json) VALUES(?,?,?)",
                (kind, document.revision, document.model_dump_json()),
            )
            return document
