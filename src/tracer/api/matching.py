import sqlite3
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from tracer.matching.models import EvaluateMatchRequest, MatchView, SaveJudgmentRequest
from tracer.matching.service import CardNotFound, MatchService
from tracer.profiles.store import InvalidReference, RevisionConflict


def create_matching_router(*, database_path: Path) -> APIRouter:
    service = MatchService(database_path)
    # Deliberately outside "/posting/": that namespace and its "postings" tag are
    # reserved for posting import/card routes (see tests/api/test_posting_routes.py).
    router = APIRouter(prefix="/matching/card/{card_key}", tags=["matching"])

    def perform(operation):
        try:
            return operation()
        except CardNotFound:
            raise HTTPException(404, detail="match.card_not_found") from None
        except RevisionConflict:
            raise HTTPException(409, detail="match.inputs_changed") from None
        except InvalidReference:
            raise HTTPException(422, detail="match.invalid_basis") from None
        except (sqlite3.Error, ValidationError):
            raise HTTPException(503, detail="match.storage_unavailable") from None

    @router.get("", response_model=MatchView)
    def read_match(card_key: UUID) -> MatchView:
        return perform(lambda: service.get(card_key))

    @router.get("/history", response_model=tuple[MatchView, ...])
    def read_history(card_key: UUID) -> tuple[MatchView, ...]:
        return perform(lambda: service.history(card_key))

    @router.post("/evaluate", response_model=MatchView)
    def evaluate_match(card_key: UUID, request: EvaluateMatchRequest) -> MatchView:
        return perform(lambda: service.evaluate(card_key, request))

    @router.put("/{match_id}/judgment/{target_id}", response_model=MatchView)
    def save_judgment(
        card_key: UUID, match_id: UUID, target_id: UUID, request: SaveJudgmentRequest,
    ) -> MatchView:
        return perform(lambda: service.save_judgment(card_key, match_id, target_id, request))

    return router
