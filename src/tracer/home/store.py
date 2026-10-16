import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

from pydantic import ValidationError

from tracer.postings.models.posting_card import PostingCard

from .models import (
    ActivityEvent, ActivityKind, AdjustEventRequest, ApplicationEvent,
    ApplicationRecord, ChangeApplicationRequest, CreateApplicationRequest,
    CreateEventRequest, CreateTaskRequest, ScheduleEvent, Task,
)


class HomeError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class HomeStore:
    """Shared facts; only explicit writes create the additional Home tables."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    @staticmethod
    def create_tables(connection: sqlite3.Connection) -> None:
        # Individual statements keep DDL inside the same explicit transaction.
        for table, key in (("home_tasks", "task_id"), ("home_events", "event_id")):
            connection.execute(
                f"CREATE TABLE IF NOT EXISTS {table} "
                f"({key} TEXT PRIMARY KEY NOT NULL, request_json TEXT NOT NULL, payload_json TEXT NOT NULL)"
            )
        connection.execute("""
            CREATE TABLE IF NOT EXISTS home_applications (
                application_id TEXT PRIMARY KEY NOT NULL,
                card_key TEXT UNIQUE NOT NULL,
                request_json TEXT NOT NULL, payload_json TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS home_application_events (
                event_id TEXT PRIMARY KEY NOT NULL,
                application_id TEXT NOT NULL, payload_json TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS home_activity_events (
                event_id TEXT PRIMARY KEY NOT NULL,
                subject_key TEXT UNIQUE NOT NULL,
                occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
            )
        """)

    @staticmethod
    def _exists(connection, table):
        return connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone() is not None

    @classmethod
    def _all(cls, connection, table, model):
        if not cls._exists(connection, table):
            return ()
        return tuple(model.model_validate_json(row[0]) for row in connection.execute(
            f"SELECT payload_json FROM {table}"
        ))

    @staticmethod
    def _get(connection, table, key, identity, model):
        row = connection.execute(
            f"SELECT payload_json FROM {table} WHERE {key}=?", (str(identity),)
        ).fetchone()
        if row is None:
            raise HomeError("home.not_found")
        return model.model_validate_json(row[0])

    @classmethod
    def _card_exists(cls, connection, card_key):
        return cls._exists(connection, "posting_cards") and connection.execute(
            "SELECT 1 FROM posting_cards WHERE card_key=?", (str(card_key),)
        ).fetchone() is not None

    @classmethod
    def _require_card(cls, connection, card_key):
        if card_key is not None and not cls._card_exists(connection, card_key):
            raise HomeError("home.card_not_found")

    @staticmethod
    def _activity(connection, kind, subject_key, now, card_key=None):
        event = ActivityEvent(
            event_id=uuid4(), kind=kind, subject_key=subject_key,
            occurred_at=now, card_key=card_key,
        )
        connection.execute(
            "INSERT OR IGNORE INTO home_activity_events "
            "(event_id, subject_key, occurred_at, payload_json) VALUES(?,?,?,?)",
            (str(event.event_id), subject_key, now.isoformat(), event.model_dump_json()),
        )

    @staticmethod
    def _replay(connection, table, key, identity, request, model):
        row = connection.execute(
            f"SELECT request_json, payload_json FROM {table} WHERE {key}=?", (str(identity),)
        ).fetchone()
        if row is None:
            return None
        if row[0] != request.model_dump_json():
            raise HomeError("home.id_conflict")
        # Compare against the immutable creation request, not mutable current state.
        return model.model_validate_json(row[1])

    def create_task(self, request: CreateTaskRequest) -> Task:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            saved = self._replay(connection, "home_tasks", "task_id", request.task_id, request, Task)
            if saved is not None:
                return saved
            task = Task(**request.model_dump(), created_at=datetime.now(timezone.utc))
            connection.execute("INSERT INTO home_tasks VALUES(?,?,?)", (
                str(task.task_id), request.model_dump_json(), task.model_dump_json(),
            ))
            # Creating a task is not a completed workspace action.
            return task

    def set_task_completed(self, task_id: UUID, completed: bool) -> Task:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            current = self._get(connection, "home_tasks", "task_id", task_id, Task)
            if (current.completed_at is not None) == completed:
                return current
            now = datetime.now(timezone.utc)
            task = current.model_copy(update={"completed_at": now if completed else None})
            connection.execute("UPDATE home_tasks SET payload_json=? WHERE task_id=?", (
                task.model_dump_json(), str(task_id),
            ))
            if completed:
                self._activity(connection, "task_completed", str(task_id), now)
            return task

    def create_event(self, request: CreateEventRequest) -> ScheduleEvent:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            saved = self._replay(connection, "home_events", "event_id", request.event_id, request, ScheduleEvent)
            if saved is not None:
                return saved
            self._require_card(connection, request.card_key)
            now = datetime.now(timezone.utc)
            event = ScheduleEvent(**request.model_dump(), created_at=now)
            connection.execute("INSERT INTO home_events VALUES(?,?,?)", (
                str(event.event_id), request.model_dump_json(), event.model_dump_json(),
            ))
            self._activity(connection, "event_recorded", f"event_recorded:{event.event_id}", now, event.card_key)
            return event

    def adjust_event(self, event_id: UUID, request: AdjustEventRequest) -> ScheduleEvent:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            current = self._get(connection, "home_events", "event_id", event_id, ScheduleEvent)
            try:
                event = ScheduleEvent.model_validate({
                    **current.model_dump(), **request.model_dump(exclude_unset=True),
                })
            except ValidationError:
                raise HomeError("home.invalid_request") from None
            if event == current:
                return current
            # A deleted historical reference may remain; new references must exist.
            if event.card_key != current.card_key:
                self._require_card(connection, event.card_key)
            now = datetime.now(timezone.utc)
            connection.execute("UPDATE home_events SET payload_json=? WHERE event_id=?", (
                event.model_dump_json(), str(event_id),
            ))
            self._activity(connection, "event_adjusted", f"event_adjusted:{uuid4()}", now, event.card_key)
            return event

    @staticmethod
    def _application_event(connection, record, now):
        event = ApplicationEvent(
            event_id=uuid4(), application_id=record.application_id,
            status=record.status, occurred_at=now,
        )
        connection.execute("INSERT INTO home_application_events VALUES(?,?,?)", (
            str(event.event_id), str(record.application_id), event.model_dump_json(),
        ))
        return event

    def create_application(self, request: CreateApplicationRequest) -> ApplicationRecord:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            saved = self._replay(connection, "home_applications", "application_id", request.application_id, request, ApplicationRecord)
            if saved is not None:
                return saved
            if connection.execute("SELECT 1 FROM home_applications WHERE card_key=?", (str(request.card_key),)).fetchone():
                raise HomeError("home.application_exists")
            self._require_card(connection, request.card_key)
            now = datetime.now(timezone.utc)
            record = ApplicationRecord(**request.model_dump(), created_at=now, updated_at=now)
            connection.execute("INSERT INTO home_applications VALUES(?,?,?,?)", (
                str(record.application_id), str(record.card_key), request.model_dump_json(), record.model_dump_json(),
            ))
            self._application_event(connection, record, now)
            self._activity(connection, "application_recorded", f"application_recorded:{record.application_id}", now, record.card_key)
            return record

    def change_application(self, application_id: UUID, request: ChangeApplicationRequest) -> ApplicationRecord:
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            current = self._get(connection, "home_applications", "application_id", application_id, ApplicationRecord)
            if current.status == request.status:
                return current
            now = datetime.now(timezone.utc)
            record = current.model_copy(update={"status": request.status, "updated_at": now})
            connection.execute("UPDATE home_applications SET payload_json=? WHERE application_id=?", (
                record.model_dump_json(), str(application_id),
            ))
            event = self._application_event(connection, record, now)
            self._activity(connection, "application_status_changed", f"application_status_changed:{event.event_id}", now, record.card_key)
            return record

    def record_card_activity(self, kind: ActivityKind, card: PostingCard) -> None:
        """Called only after a successful Card write; owns no Card facts."""
        with closing(sqlite3.connect(self.database_path)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self.create_tables(connection)
            subject = str(card.card_key) if kind == "card_saved" else str(uuid4())
            self._activity(connection, kind, f"{kind}:{subject}", datetime.now(timezone.utc), card.card_key)

    def activity(self, start: datetime, end: datetime) -> dict:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("BEGIN")
            events = sorted(self._all(connection, "home_activity_events", ActivityEvent), key=lambda event: (event.occurred_at, str(event.event_id)))
            return {
                "events": tuple(event for event in events if start <= event.occurred_at < end),
                "recording_started_at": events[0].occurred_at if events else None,
            }

    def overview(self, *, today: date, day_start: datetime, day_end: datetime,
                 upcoming_end: datetime, interviews_end: datetime) -> dict:
        with closing(sqlite3.connect(self.database_path)) as connection:
            # A read transaction gives all projections the same committed snapshot.
            connection.execute("BEGIN")
            tasks = self._all(connection, "home_tasks", Task)
            events = self._all(connection, "home_events", ScheduleEvent)
            applications = self._all(connection, "home_applications", ApplicationRecord)
            activity = self._all(connection, "home_activity_events", ActivityEvent)
            cards = self._all(connection, "posting_cards", PostingCard)
            card_keys = {card.card_key for card in cards}
            application_by_card = {record.card_key: record for record in applications}
            pending = sorted((task for task in tasks if task.completed_at is None and (task.due_on is None or task.due_on <= today)), key=lambda task: (task.due_on or date.max, str(task.task_id)))
            completed = sorted((task for task in tasks if task.completed_at is not None and day_start <= task.completed_at < day_end), key=lambda task: (task.completed_at, str(task.task_id)))
            scheduled = sorted((event for event in events if not event.cancelled), key=lambda event: (event.starts_at, str(event.event_id)))
            recent_cards = sorted(cards, key=lambda card: (card.created_at, str(card.card_key)), reverse=True)[:5]
            recent_activity = sorted(activity, key=lambda event: (event.occurred_at, str(event.event_id)), reverse=True)[:10]
            return {
                "today": {"tasks": pending, "completed_count": len(completed), "completed_tasks": completed,
                          "events": tuple({"event": event, "card_missing": event.card_key is not None and event.card_key not in card_keys} for event in scheduled if day_start <= event.starts_at < day_end)},
                "upcoming": {
                    "events": tuple({"event": event, "card_missing": event.card_key is not None and event.card_key not in card_keys} for event in scheduled if day_start <= event.starts_at < upcoming_end),
                    # Date facts use the supplied local date, never a UTC offset
                    # converted into an assumed region or timezone.
                    "tasks": tuple(sorted((task for task in tasks if task.completed_at is None and task.due_on is not None and today <= task.due_on < today + timedelta(days=14)), key=lambda task: (task.due_on, str(task.task_id)))),
                },
                "your_search": {
                    "active": sum(record.status in {"applied", "interviewing"} for record in applications),
                    "awaiting_reply": sum(record.status == "applied" for record in applications),
                    "interviews": sum(event.kind == "interview" and day_start <= event.starts_at < interviews_end for event in scheduled),
                },
                "applications": tuple({"record": record, "card_missing": record.card_key not in card_keys} for record in sorted(applications, key=lambda record: (record.created_at, str(record.application_id)), reverse=True)),
                "recent_jobs": tuple({"card": card, "application": application_by_card.get(card.card_key)} for card in recent_cards),
                "recent_activity": tuple({"event": event, "card_missing": event.card_key is not None and event.card_key not in card_keys} for event in recent_activity),
            }
