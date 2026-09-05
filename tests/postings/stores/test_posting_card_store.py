import sqlite3
from datetime import UTC, datetime
from uuid import UUID

from tracer.postings.models.posting_card import PostingCard
from tracer.postings.models.posting_details import PostingDetails
from tracer.postings.stores.posting_card_store import PostingCardStore


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")
OTHER_IMPORT_KEY = UUID("d48ff8ea-026a-41fc-a20f-2e6e40ac671b")
CARD_KEY = UUID("5935c3ec-2488-4f8c-b014-ffd2ea17e91f")
SECOND_CARD_KEY = UUID("413c230f-e7a1-45d4-9179-faa347fe8a78")
OTHER_CARD_KEY = UUID("940744da-8147-42ed-b1e0-6755128ceafb")
MISSING_CARD_KEY = UUID("0f2c1b54-d309-4012-9a22-1ff27cf78d2a")


def make_posting_details(
    company_name: str | None = "Thermondo GmbH",
    position_title: str | None = "Working Student Robotics",
) -> PostingDetails:
    empty_source = {"excerpts": [], "source_urls": []}
    parsed_company_name = (
        {"value": company_name, "origin": "source"}
        if company_name is not None
        else None
    )
    parsed_position_title = (
        {"value": position_title, "origin": "source"}
        if position_title is not None
        else None
    )

    return PostingDetails(
        identity={
            "source": empty_source,
            "company_name": parsed_company_name,
            "department_name": None,
            "position_title": parsed_position_title,
            "external_job_id": None,
            "canonical_posting_url": None,
            "source_platform": None,
            "published_on": None,
            "posting_language": None,
        },
        company={
            "source": empty_source,
            "industry_tags": [],
            "employee_range": None,
            "company_summary": None,
        },
        classification={
            "source": empty_source,
            "role_families": None,
            "original_employment_type": None,
            "contract_type": None,
            "seniority": None,
            "internship_requirement": None,
            "eligible_groups": None,
            "study_fields": None,
            "student_status_required": None,
            "target_semester": None,
        },
        work_conditions={
            "source": empty_source,
            "locations": [],
            "work_modes": None,
            "weekly_hours": None,
            "schedule": None,
            "travel_requirement": None,
            "start_on": None,
            "duration": None,
        },
        role_content={
            "source": empty_source,
            "role_summary": None,
            "responsibilities": [],
            "domains": [],
        },
        requirements={"source": empty_source, "groups": []},
        compensation={
            "source": empty_source,
            "entries": [],
            "benefits": [],
            "vacation_days": None,
        },
        application_instructions={
            "source": empty_source,
            "channels": None,
            "application_url": None,
            "required_email_subject": None,
            "required_documents": [],
            "special_instructions": [],
            "application_deadline": None,
        },
        contact=None,
    )


def make_card(
    card_key: UUID = CARD_KEY,
    import_key: UUID = IMPORT_KEY,
    created_at: datetime | None = None,
    company_name: str | None = "Thermondo GmbH",
    position_title: str | None = "Working Student Robotics",
) -> PostingCard:
    return PostingCard(
        card_key=card_key,
        import_key=import_key,
        created_at=created_at or datetime(2026, 8, 17, 10, 30, tzinfo=UTC),
        posting=make_posting_details(company_name, position_title),
    )


def test_store_creates_posting_cards_table_and_import_index(tmp_path):
    database_path = tmp_path / "tracer.db"

    PostingCardStore(database_path)

    connection = sqlite3.connect(database_path)
    try:
        columns = connection.execute(
            "PRAGMA table_info(posting_cards)"
        ).fetchall()
        indexes = connection.execute(
            "PRAGMA index_list(posting_cards)"
        ).fetchall()
        index_columns = connection.execute(
            "PRAGMA index_info(idx_posting_cards_import_key)"
        ).fetchall()
    finally:
        connection.close()

    assert [(column[1], column[2]) for column in columns] == [
        ("card_key", "TEXT"),
        ("import_key", "TEXT"),
        ("schema_version", "INTEGER"),
        ("created_at", "TEXT"),
        ("company_name", "TEXT"),
        ("position_title", "TEXT"),
        ("original_payload_json", "TEXT"),
        ("payload_json", "TEXT"),
    ]
    assert next(
        column[3] for column in columns if column[1] == "original_payload_json"
    ) == 1
    assert "idx_posting_cards_import_key" in {
        index[1] for index in indexes
    }
    assert [column[2] for column in index_columns] == ["import_key"]


def test_store_adds_posting_card(tmp_path):
    database_path = tmp_path / "tracer.db"
    store = PostingCardStore(database_path)
    card = make_card()

    store.add(card)

    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            """
            SELECT
                card_key,
                import_key,
                schema_version,
                created_at,
                company_name,
                position_title,
                original_payload_json,
                payload_json
            FROM posting_cards
            WHERE card_key = ?
            """,
            (str(card.card_key),),
        ).fetchone()
    finally:
        connection.close()

    assert row == (
        str(card.card_key),
        str(card.import_key),
        card.schema_version,
        card.created_at.isoformat(),
        "Thermondo GmbH",
        "Working Student Robotics",
        card.model_dump_json(),
        card.model_dump_json(),
    )


def test_store_allows_missing_company_and_position_projections(tmp_path):
    database_path = tmp_path / "tracer.db"
    store = PostingCardStore(database_path)
    card = make_card(company_name=None, position_title=None)

    store.add(card)

    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            """
            SELECT company_name, position_title
            FROM posting_cards
            WHERE card_key = ?
            """,
            (str(card.card_key),),
        ).fetchone()
    finally:
        connection.close()

    assert row == (None, None)


def test_store_gets_card_by_card_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    card = make_card()
    store.add(card)

    stored_card = store.get_by_card_key(card.card_key)

    assert stored_card == card


def test_store_returns_none_for_missing_card_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert store.get_by_card_key(MISSING_CARD_KEY) is None


def test_store_gets_original_card_by_card_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    card = make_card()
    store.add(card)

    assert store.get_original_by_card_key(card.card_key) == card


def test_store_returns_none_for_missing_original_card(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert store.get_original_by_card_key(MISSING_CARD_KEY) is None


def test_store_gets_all_cards_by_import_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    first_card = make_card()
    second_card = make_card(
        card_key=SECOND_CARD_KEY,
        created_at=datetime(2026, 8, 17, 11, 30, tzinfo=UTC),
        position_title="Working Student Data",
    )
    other_card = make_card(
        card_key=OTHER_CARD_KEY,
        import_key=OTHER_IMPORT_KEY,
    )
    store.add(second_card)
    store.add(other_card)
    store.add(first_card)

    stored_cards = store.get_by_import_key(IMPORT_KEY)

    assert stored_cards == (first_card, second_card)


def test_store_returns_empty_tuple_for_missing_import_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert store.get_by_import_key(OTHER_IMPORT_KEY) == ()


def test_store_gets_all_cards_newest_first(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    older_card = make_card()
    newer_card = make_card(
        card_key=SECOND_CARD_KEY,
        created_at=datetime(2026, 8, 17, 11, 30, tzinfo=UTC),
    )
    store.add(older_card)
    store.add(newer_card)

    assert store.get_all() == (newer_card, older_card)


def test_store_returns_empty_tuple_when_no_cards_exist(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert store.get_all() == ()


def test_store_checks_whether_posting_card_exists(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    card = make_card()

    assert not store.exists(card.card_key)

    store.add(card)

    assert store.exists(card.card_key)


def test_store_deletes_posting_card_by_card_key(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    card = make_card()
    other_card = make_card(card_key=OTHER_CARD_KEY)
    store.add(card)
    store.add(other_card)

    deleted = store.delete(card.card_key)

    assert deleted
    assert store.get_by_card_key(card.card_key) is None
    assert store.get_original_by_card_key(card.card_key) is None
    assert store.get_by_card_key(other_card.card_key) == other_card
    assert store.get_original_by_card_key(other_card.card_key) == other_card


def test_store_returns_false_when_deleting_missing_card(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert not store.delete(MISSING_CARD_KEY)


def test_store_replaces_posting_card(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")
    card = make_card()
    store.add(card)
    updated_card = PostingCard.model_validate(
        {
            **card.model_dump(),
            "posting_alias": "Munich robotics",
            "user_notes": "Check the start date.",
            "tags": ("priority", "internship"),
        }
    )

    updated = store.update(updated_card)

    assert updated
    assert store.get_by_card_key(card.card_key) == updated_card
    assert store.get_original_by_card_key(card.card_key) == card


def test_store_preserves_original_payload_across_updates_and_reopening(tmp_path):
    database_path = tmp_path / "tracer.db"
    store = PostingCardStore(database_path)
    card = make_card()
    store.add(card)

    for title in ("Working Student Data", "Working Student Automation"):
        payload = card.model_dump()
        payload["posting"]["identity"]["position_title"] = {
            "value": title,
            "origin": "user_defined",
        }
        updated_card = PostingCard.model_validate(payload)

        assert store.update(updated_card)
        store = PostingCardStore(database_path)
        assert store.get_by_card_key(card.card_key) == updated_card
        assert store.get_all() == (updated_card,)
        assert store.get_by_import_key(card.import_key) == (updated_card,)
        assert store.get_original_by_card_key(card.card_key) == card

        connection = sqlite3.connect(database_path)
        try:
            row = connection.execute(
                """
                SELECT original_payload_json, payload_json, position_title
                FROM posting_cards
                WHERE card_key = ?
                """,
                (str(card.card_key),),
            ).fetchone()
        finally:
            connection.close()

        assert row == (
            card.model_dump_json(),
            updated_card.model_dump_json(),
            title,
        )


def test_store_returns_false_when_updating_missing_card(tmp_path):
    store = PostingCardStore(tmp_path / "tracer.db")

    assert not store.update(make_card(card_key=MISSING_CARD_KEY))
