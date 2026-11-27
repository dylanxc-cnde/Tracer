from fastapi.testclient import TestClient

from tests.api.factories import (
    FakePostingParser,
    make_card_update_request,
    make_parse_result,
)
from tracer.api.app import create_app


def test_search_opens_only_the_current_confirmed_card(tmp_path):
    original_title = "Working Student Data Analytics"
    current_title = "Werkstudent Datenanalyse Netzentgeltabrechnung"
    empty_results = {"results": [], "has_more": False}
    app = create_app(
        database_path=tmp_path / "tracer.db",
        posting_parser=FakePostingParser(make_parse_result()),
    )

    with TestClient(app) as client:
        imported = client.post(
            "/posting/import",
            json={"kind": "text", "text": original_title, "source_url": None},
        )
        assert imported.status_code == 201
        import_key = imported.json()["import_key"]
        parsed = client.post(f"/posting/import/{import_key}/parse-results")
        assert parsed.status_code == 200
        posting = parsed.json()["postings"][0]["details"]
        assert posting["identity"]["position_title"]["value"] == original_title

        proposal_only = client.get("/search", params={"q": original_title})
        assert proposal_only.status_code == 200
        assert proposal_only.json() == empty_results

        confirmed = client.post(
            "/posting/card", json={"import_key": import_key, "posting": posting}
        )
        assert confirmed.status_code == 201
        original = confirmed.json()
        card_key = original["card_key"]
        assert client.get("/search", params={"q": original_title}).json()["results"][0][
            "target"
        ] == {"kind": "card", "id": card_key}

        edited = client.patch(
            f"/posting/card/{card_key}",
            json=make_card_update_request(position_title=current_title),
        )
        assert edited.status_code == 200

        search = client.get("/search", params={"q": "netzentgeltabrechnung"})
        assert search.status_code == 200
        assert search.json() == {
            "results": [
                {
                    "type": "job",
                    "source": "Card library",
                    "title": current_title,
                    "snippet": "Velora Grid Systems SE",
                    "target": {"kind": "card", "id": card_key},
                    "card_missing": False,
                }
            ],
            "has_more": False,
        }
        original_only = client.get("/search", params={"q": original_title})
        assert original_only.status_code == 200
        assert original_only.json() == empty_results

        target_id = search.json()["results"][0]["target"]["id"]
        opened = client.get(f"/posting/card/{target_id}")
        assert opened.status_code == 200
        assert opened.json() == edited.json()
        snapshot = client.get(f"/posting/card/{card_key}/original")
        assert snapshot.status_code == 200
        assert snapshot.json() == original
