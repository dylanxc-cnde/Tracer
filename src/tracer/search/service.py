import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from tracer.home.models import ApplicationRecord, ScheduleEvent, Task


ResultType = Literal["job", "company", "note", "task", "event", "application"]
HomeType = Literal["task", "event", "application"]


class SearchTarget(BaseModel):
    kind: Literal["card", "task", "event", "application"]
    id: UUID


class SearchResult(BaseModel):
    type: ResultType
    source: str
    title: str
    snippet: str
    target: SearchTarget
    card_missing: bool = False


class SearchResults(BaseModel):
    results: tuple[SearchResult, ...]
    has_more: bool


class SearchField(BaseModel):
    label: str
    value: str


class SearchRecord(BaseModel):
    type: HomeType
    id: UUID
    title: str
    source: str
    fields: tuple[SearchField, ...]
    card_key: UUID | None
    card_missing: bool


# All identifiers and JSON paths are code-owned. Neither a query nor a record ID
# is ever interpolated into SQL. Do not search whole payloads: those also contain
# provenance and implementation metadata outside the local-search surface.
_CARD_TITLE = "COALESCE(NULLIF(json_extract(c.payload_json, '$.posting_alias'), ''), json_extract(c.payload_json, '$.posting.identity.position_title.value'), 'Untitled job')"
_COMPANY = "COALESCE(json_extract(c.payload_json, '$.posting.identity.company_name.value'), '')"
_HOME = {
    "task": ("home_tasks", "task_id", Task),
    "event": ("home_events", "event_id", ScheduleEvent),
    "application": ("home_applications", "application_id", ApplicationRecord),
}


def _snippet(text: str, query: str, length: int = 220) -> str:
    text = " ".join(text.split())
    # Case folding can change character counts (e.g. ß). Map the match back to
    # original text in one pass so long notes do not require quadratic slicing.
    start = 0
    if len(text) > length:
        match = text.casefold().find(query.casefold())
        if match >= 0:
            folded_offset = 0
            for index, character in enumerate(text):
                if folded_offset >= match:
                    start = max(0, index - 20)
                    break
                folded_offset += len(character.casefold())
    return ("…" if start else "") + text[start:start + length] + ("…" if len(text) > start + length else "")


class SearchService:
    """Bounded literal substring search; no writes, migrations or AI consumers."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(f"{self.database_path.resolve().as_uri()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        connection.create_function("search_fold", 1, lambda value: str(value or "").casefold(), deterministic=True)
        return connection

    @staticmethod
    def _tables(connection: sqlite3.Connection) -> set[str]:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    def search(self, query: str, limit: int = 20) -> SearchResults:
        query = query.strip()
        if not 1 <= len(query) <= 200 or not 1 <= limit <= 50:
            raise ValueError("search.invalid_request")
        if not self.database_path.exists():
            return SearchResults(results=(), has_more=False)
        with closing(self._connect()) as connection:
            # One consistent snapshot for table discovery, joins and all result types.
            connection.execute("BEGIN")
            tables = self._tables(connection)
            parts: list[str] = []
            if "posting_cards" in tables:
                current_title = "COALESCE(json_extract(c.payload_json, '$.posting.identity.position_title.value'), '')"
                for kind, title, snippet, haystack in (
                    ("job", _CARD_TITLE, _COMPANY, f"{_CARD_TITLE} || ' ' || {current_title}"),
                    ("company", _COMPANY, _CARD_TITLE, _COMPANY),
                    ("note", _CARD_TITLE, "COALESCE(json_extract(c.payload_json, '$.user_notes'), '')", "COALESCE(json_extract(c.payload_json, '$.user_notes'), '')"),
                ):
                    parts.append(f"SELECT '{kind}' AS type, 'Card library' AS source, {title} AS title, "
                                 f"{snippet} AS snippet, 'card' AS kind, c.card_key AS id, 0 AS card_missing "
                                 f"FROM posting_cards c WHERE instr(search_fold({haystack}), ?) > 0")
            for kind, (table, key, _) in _HOME.items():
                if table not in tables:
                    continue
                has_cards = "posting_cards" in tables
                join = "LEFT JOIN posting_cards c ON c.card_key=json_extract(h.payload_json, '$.card_key')" if has_cards and kind != "task" else ""
                missing = "0" if kind == "task" else (
                    "(json_extract(h.payload_json, '$.card_key') IS NOT NULL AND c.card_key IS NULL)" if has_cards
                    else "(json_extract(h.payload_json, '$.card_key') IS NOT NULL)"
                )
                if kind == "application":
                    title = _CARD_TITLE if has_cards else "'Deleted job'"
                    title = f"CASE WHEN {missing} THEN 'Deleted job' ELSE {title} END"
                    company = _COMPANY if has_cards else "''"
                    snippet = "'Applied ' || json_extract(h.payload_json, '$.applied_on') || ' · ' || json_extract(h.payload_json, '$.status')"
                    haystack = f"{title} || ' ' || {company} || ' ' || {snippet}"
                else:
                    title = "json_extract(h.payload_json, '$.title')"
                    snippet = ("COALESCE(json_extract(h.payload_json, '$.due_on'), 'No due date') || ' · ' || CASE WHEN json_extract(h.payload_json, '$.completed_at') IS NULL THEN 'Pending' ELSE 'Completed' END" if kind == "task" else
                               "json_extract(h.payload_json, '$.kind') || ' · ' || json_extract(h.payload_json, '$.starts_at') || CASE WHEN json_extract(h.payload_json, '$.cancelled') THEN ' · Cancelled' ELSE '' END")
                    haystack = f"{title} || ' ' || {snippet}"
                parts.append(f"SELECT '{kind}' AS type, 'Home' AS source, {title} AS title, {snippet} AS snippet, "
                             f"'{kind}' AS kind, h.{key} AS id, {missing} AS card_missing FROM {table} h {join} "
                             f"WHERE instr(search_fold({haystack}), ?) > 0")
            if not parts:
                return SearchResults(results=(), has_more=False)
            rows = connection.execute(
                " UNION ALL ".join(parts) + " ORDER BY type, title COLLATE NOCASE, id LIMIT ?",
                (*([query.casefold()] * len(parts)), limit + 1),
            ).fetchall()
            results = tuple(SearchResult(
                type=row["type"], source=row["source"], title=row["title"],
                snippet=row["snippet"],
                target=SearchTarget(kind=row["kind"], id=row["id"]), card_missing=bool(row["card_missing"]),
            ) for row in rows[:limit])
            return SearchResults(results=tuple(
                result.model_copy(update={"snippet": _snippet(result.snippet, query)}) for result in results
            ), has_more=len(rows) > limit)

    def get_record(self, kind: HomeType, identity: UUID) -> SearchRecord | None:
        """Open even past/complete records that are outside today's Home window."""
        if not self.database_path.exists():
            return None
        table, key, model = _HOME[kind]
        with closing(self._connect()) as connection:
            connection.execute("BEGIN")
            tables = self._tables(connection)
            if table not in tables:
                return None
            row = connection.execute(f"SELECT payload_json FROM {table} WHERE {key}=?", (str(identity),)).fetchone()
            if row is None:
                return None
            record = model.model_validate_json(row[0])
            card_key = getattr(record, "card_key", None)
            card = connection.execute(
                f"SELECT {_CARD_TITLE}, {_COMPANY} FROM posting_cards c WHERE c.card_key=?", (str(card_key),),
            ).fetchone() if card_key and "posting_cards" in tables else None
            card_missing = card_key is not None and card is None
            if isinstance(record, Task):
                title = record.title
                fields = [("Due date", str(record.due_on) if record.due_on else "No due date"),
                          ("Status", "Completed" if record.completed_at else "Pending")]
            elif isinstance(record, ScheduleEvent):
                title = record.title
                fields = [("Kind", record.kind), ("Starts at", record.starts_at.isoformat()),
                          ("Ends at", record.ends_at.isoformat() if record.ends_at else "Not set"),
                          ("Status", "Cancelled" if record.cancelled else "Scheduled")]
            else:
                title = "Deleted job" if card_missing else "Application"
                fields = [("Applied on", record.applied_on.isoformat()), ("Status", record.status)]
            if card is not None:
                # Project only display text, never the job's provenance or raw JSON.
                if kind == "application":
                    title = card[0]
                fields.append(("Job", card[0]))
                if card[1]:
                    fields.append(("Company", card[1]))
            return SearchRecord(type=kind, id=identity, title=title, source="Home",
                                fields=tuple(SearchField(label=label, value=value) for label, value in fields),
                                card_key=card_key, card_missing=card_missing)
