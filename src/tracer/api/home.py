import sqlite3
from datetime import date
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import AwareDatetime, ValidationError

from tracer.home.models import (
    AdjustEventRequest, ApplicationRecord, ChangeApplicationRequest,
    CreateApplicationRequest, CreateEventRequest, CreateTaskRequest, ScheduleEvent, Task,
)
from tracer.home.store import HomeError, HomeStore
from tracer.settings.settings_store import SettingsStore


def create_home_router(*, database_path: Path, settings_store: SettingsStore) -> APIRouter:
    store = HomeStore(database_path)
    router = APIRouter(prefix="/home", tags=["home"])

    def perform(operation):
        try:
            return operation()
        except HomeError as error:
            status = {
                "home.invalid_request": 422,
                "home.id_conflict": 409,
                "home.not_found": 404,
                "home.card_not_found": 404,
                "home.application_exists": 409,
            }[error.code]
            raise HTTPException(status, detail=error.code) from None
        except (sqlite3.Error, ValidationError):
            # Never expose titles, stored payloads, database paths or raw errors.
            raise HTTPException(503, detail="home.storage_unavailable") from None

    def read_usage():
        # The legacy store is supplied by the app. Its public get() has no DDL,
        # writes, credential access or provider connection checks.
        settings = settings_store.get()
        providers = settings.ai.providers if settings else ()
        return {
            "status": "not_recorded", "tokens": None, "estimated_cost_usd": None,
            "providers": tuple({
                "provider_key": provider.provider_key,
                "display_name": provider.display_name,
                "provider": provider.provider,
                "monthly_budget_usd": provider.monthly_budget_usd,
                "budget_status": "not_set" if provider.monthly_budget_usd is None else (
                    "zero" if provider.monthly_budget_usd == 0 else "set"
                ),
            } for provider in providers),
        }

    @router.get("/overview")
    def read_overview(
        today: date, day_start: AwareDatetime, day_end: AwareDatetime,
        upcoming_end: AwareDatetime, interviews_end: AwareDatetime,
    ) -> dict:
        if not day_start < day_end <= upcoming_end or not day_end <= interviews_end:
            raise HTTPException(422, detail="home.invalid_request")

        def read():
            overview = store.overview(
                today=today, day_start=day_start, day_end=day_end,
                upcoming_end=upcoming_end, interviews_end=interviews_end,
            )
            return {**overview, "ai_usage": read_usage()}

        return perform(read)

    @router.get("/activity")
    def read_activity(
        start: AwareDatetime = Query(alias="from"),
        end: AwareDatetime = Query(alias="to"),
    ) -> dict:
        if start >= end:
            raise HTTPException(422, detail="home.invalid_request")
        return perform(lambda: store.activity(start, end))

    @router.post("/tasks", status_code=201, response_model=Task)
    def create_task(request: CreateTaskRequest) -> Task:
        return perform(lambda: store.create_task(request))

    @router.post("/tasks/{task_id}/complete", response_model=Task)
    def complete_task(task_id: UUID) -> Task:
        return perform(lambda: store.set_task_completed(task_id, True))

    @router.post("/tasks/{task_id}/reopen", response_model=Task)
    def reopen_task(task_id: UUID) -> Task:
        return perform(lambda: store.set_task_completed(task_id, False))

    @router.post("/events", status_code=201, response_model=ScheduleEvent)
    def create_event(request: CreateEventRequest) -> ScheduleEvent:
        return perform(lambda: store.create_event(request))

    @router.patch("/events/{event_id}", response_model=ScheduleEvent)
    def adjust_event(event_id: UUID, request: AdjustEventRequest) -> ScheduleEvent:
        return perform(lambda: store.adjust_event(event_id, request))

    @router.post("/applications", status_code=201, response_model=ApplicationRecord)
    def create_application(request: CreateApplicationRequest) -> ApplicationRecord:
        return perform(lambda: store.create_application(request))

    @router.patch("/applications/{application_id}", response_model=ApplicationRecord)
    def change_application(application_id: UUID, request: ChangeApplicationRequest) -> ApplicationRecord:
        return perform(lambda: store.change_application(application_id, request))

    return router
