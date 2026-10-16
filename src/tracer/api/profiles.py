import sqlite3
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from tracer.profiles.models import CandidateProfile, JobSearchGoal, SaveGoalRequest, SaveProfileRequest
from tracer.profiles.store import InvalidReference, ProfileStore, RevisionConflict


def create_profiles_router(*, database_path: Path) -> APIRouter:
    store = ProfileStore(database_path)
    router = APIRouter(tags=["personal"])

    def perform(operation):
        try:
            return operation()
        except RevisionConflict:
            raise HTTPException(409, detail="personal.revision_conflict") from None
        except InvalidReference:
            raise HTTPException(422, detail="personal.invalid_reference") from None
        except (sqlite3.Error, ValidationError):
            # Never echo private facts, database paths, or invalid stored payloads.
            raise HTTPException(503, detail="personal.storage_unavailable") from None

    @router.get("/profile", response_model=CandidateProfile | None)
    def read_profile() -> CandidateProfile | None:
        return perform(store.get_profile)

    @router.put("/profile", response_model=CandidateProfile)
    def save_profile(request: SaveProfileRequest) -> CandidateProfile:
        return perform(lambda: store.save_profile(request))

    @router.get("/goal", response_model=JobSearchGoal | None)
    def read_goal() -> JobSearchGoal | None:
        return perform(store.get_goal)

    @router.put("/goal", response_model=JobSearchGoal)
    def save_goal(request: SaveGoalRequest) -> JobSearchGoal:
        return perform(lambda: store.save_goal(request))

    return router
