import sqlite3
from datetime import UTC, datetime
from uuid import UUID

from tracer.postings import PostingImportRequest
from tracer.postings.stores.posting_import_request_store import (
    PostingImportRequestStore,
)


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")
OTHER_IMPORT_KEY = UUID("d48ff8ea-026a-41fc-a20f-2e6e40ac671b")
MISSING_IMPORT_KEY = UUID("84c02ce6-a6e7-45cc-a8b7-c44166d2db26")


def make_request(
    import_key: UUID = IMPORT_KEY,
    submitted_at: datetime | None = None,
) -> PostingImportRequest:
    return PostingImportRequest(
        import_key=import_key,
        submitted_at=(
            submitted_at
            or datetime(2026, 8, 15, 10, 30, tzinfo=UTC)
        ),
        source={
            "kind": "url",
            "url": "https://example.com/jobs/robotics",
        },
    )


def test_store_creates_posting_imports_table(tmp_path):
    database_path = tmp_path / "tracer.db"

    PostingImportRequestStore(database_path)

    assert database_path.is_file()

    connection = sqlite3.connect(database_path)
    try:
        table = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = ? AND name = ?
            """,
            ("table", "posting_imports"),
        ).fetchone()
        columns = connection.execute(
            "PRAGMA table_info(posting_imports)"
        ).fetchall()
    finally:
        connection.close()

    assert table == ("posting_imports",)
    assert [(column[1], column[2]) for column in columns] == [
        ("import_key", "TEXT"),
        ("schema_version", "INTEGER"),
        ("submitted_at", "TEXT"),
        ("source_kind", "TEXT"),
        ("payload_json", "TEXT"),
    ]


def test_store_adds_posting_import_request(tmp_path):
    database_path = tmp_path / "tracer.db"
    store = PostingImportRequestStore(database_path)
    request = make_request()

    store.add(request)

    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            """
            SELECT
                import_key,
                schema_version,
                submitted_at,
                source_kind,
                payload_json
            FROM posting_imports
            WHERE import_key = ?
            """,
            (str(request.import_key),),
        ).fetchone()
    finally:
        connection.close()

    assert row == (
        str(request.import_key),
        request.schema_version,
        request.submitted_at.isoformat(),
        request.source.kind,
        request.model_dump_json(),
    )


def test_store_gets_posting_import_request(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")
    request = make_request()
    store.add(request)

    stored_request = store.get(request.import_key)

    assert stored_request == request


def test_store_returns_none_for_missing_import_request(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")

    assert store.get(MISSING_IMPORT_KEY) is None


def test_store_checks_whether_import_request_exists(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")
    request = make_request()

    assert not store.exists(request.import_key)

    store.add(request)

    assert store.exists(request.import_key)


def test_store_gets_all_import_requests_newest_first(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")
    older_request = make_request()
    newer_request = make_request(
        import_key=OTHER_IMPORT_KEY,
        submitted_at=datetime(2026, 8, 15, 11, 30, tzinfo=UTC),
    )
    store.add(older_request)
    store.add(newer_request)

    assert store.get_all() == (newer_request, older_request)


def test_store_returns_empty_tuple_when_no_import_requests_exist(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")

    assert store.get_all() == ()


def test_store_deletes_import_request_by_import_key(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")
    request = make_request()
    other_request = make_request(import_key=OTHER_IMPORT_KEY)
    store.add(request)
    store.add(other_request)

    deleted = store.delete(request.import_key)

    assert deleted
    assert store.get(request.import_key) is None
    assert store.get(other_request.import_key) == other_request


def test_store_returns_false_when_deleting_missing_import_request(tmp_path):
    store = PostingImportRequestStore(tmp_path / "tracer.db")

    assert not store.delete(MISSING_IMPORT_KEY)
