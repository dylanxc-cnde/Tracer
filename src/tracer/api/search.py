import sqlite3
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from tracer.search.service import HomeType, SearchRecord, SearchResults, SearchService


def create_search_router(*, database_path: Path) -> APIRouter:
    service = SearchService(database_path)
    router = APIRouter(prefix="/search", tags=["search"])

    def perform(operation):
        try:
            return operation()
        except (sqlite3.Error, ValidationError):
            # Never echo query text, payloads, SQL, database paths or raw errors.
            raise HTTPException(503, detail="search.storage_unavailable") from None

    @router.get("", response_model=SearchResults)
    def search_local(q: str = Query(min_length=1, max_length=200), limit: int = Query(default=20, ge=1, le=50)) -> SearchResults:
        if not q.strip():
            raise HTTPException(422, detail="search.invalid_request")
        return perform(lambda: service.search(q, limit))

    @router.get("/records/{kind}/{identity}", response_model=SearchRecord)
    def read_search_record(kind: HomeType, identity: UUID) -> SearchRecord:
        record = perform(lambda: service.get_record(kind, identity))
        if record is None:
            raise HTTPException(404, detail="search.not_found")
        return record

    return router
