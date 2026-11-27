from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.api.factories import (
    FakePostingParser,
    make_card_update_request,
    make_parse_result,
    make_posting_details,
)
from tracer.api.app import create_app

PASTED_TEXT = "Synthetic posting text that stays in Import History."
SUBMITTED_URL = "https://example.com/jobs/transport"
PASTED_SOURCE_URL = "http://example.com/jobs/mobility"


def save_card(client, source):
    create_import = client.post("/posting/import", json=source)
    assert create_import.status_code == 201
    receipt = create_import.json()
    create_card = client.post(
        "/posting/card",
        json={
            "import_key": receipt["import_key"],
            "posting": make_posting_details().model_dump(mode="json"),
        },
    )
    assert create_card.status_code == 201
    return receipt, create_card.json()


@pytest.mark.parametrize(
    "source,source_url",
    [
        ({"kind": "url", "url": SUBMITTED_URL}, SUBMITTED_URL),
        (
            {"kind": "text", "text": PASTED_TEXT, "source_url": PASTED_SOURCE_URL},
            PASTED_SOURCE_URL,
        ),
        ({"kind": "text", "text": PASTED_TEXT}, None),
    ],
    ids=["url", "text-with-link", "text-without-link"],
)
def test_card_source_receipt_projects_only_submitted_metadata(
    tmp_path, source, source_url
):
    parser = FakePostingParser(make_parse_result())
    app = create_app(database_path=tmp_path / "tracer.sqlite3", posting_parser=parser)

    with TestClient(app) as client:
        receipt, card = save_card(client, source)
        response = client.get(f"/posting/card/{card['card_key']}/source-receipt")

    assert response.status_code == 200
    assert receipt["submitted_at"].endswith("Z")
    assert response.json() == {
        "kind": source["kind"],
        "submitted_at": receipt["submitted_at"],
        "source_url": source_url,
    }
    assert PASTED_TEXT not in response.text
    assert parser.requests == []


def test_card_source_receipt_keeps_original_link_after_a_card_edit(tmp_path):
    app = create_app(database_path=tmp_path / "tracer.sqlite3")
    edited_url = "https://example.org/jobs/updated"

    with TestClient(app) as client:
        receipt, card = save_card(client, {"kind": "url", "url": SUBMITTED_URL})
        card_url = f"/posting/card/{card['card_key']}"
        update = client.patch(
            card_url, json=make_card_update_request(canonical_posting_url=edited_url)
        )
        response = client.get(f"{card_url}/source-receipt")

    assert update.status_code == 200
    assert (
        update.json()["posting"]["identity"]["canonical_posting_url"]["value"]
        == edited_url
    )
    assert response.status_code == 200
    assert response.json() == {
        "kind": "url",
        "submitted_at": receipt["submitted_at"],
        "source_url": SUBMITTED_URL,
    }


def test_card_source_receipt_is_null_after_deleting_the_import(tmp_path):
    app = create_app(database_path=tmp_path / "tracer.sqlite3")

    with TestClient(app) as client:
        receipt, card = save_card(client, {"kind": "text", "text": PASTED_TEXT})
        card_url = f"/posting/card/{card['card_key']}"
        import_url = f"/posting/import/{receipt['import_key']}"
        assert client.delete(import_url).status_code == 204

        response = client.get(f"{card_url}/source-receipt")
        assert response.status_code == 200
        assert response.json() is None
        assert client.get(card_url).json() == card
        assert client.get(f"{card_url}/original").json() == card
        assert client.get(import_url).status_code == 404


def test_reading_source_receipt_for_a_missing_card_returns_404(tmp_path):
    app = create_app(database_path=tmp_path / "tracer.sqlite3")

    with TestClient(app) as client:
        response = client.get(f"/posting/card/{uuid4()}/source-receipt")

    assert response.status_code == 404
    assert response.json() == {"detail": "Posting card not found"}
