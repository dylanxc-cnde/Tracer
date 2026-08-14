import sqlite3

from tracer.postings.import_store import PostingImportStore


def test_store_creates_posting_imports_table(tmp_path):
    database_path = tmp_path / "tracer.db"

    PostingImportStore(database_path)

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
