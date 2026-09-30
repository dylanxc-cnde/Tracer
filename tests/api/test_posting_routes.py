import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app


def test_posting_routes_share_a_prefix_and_documentation_tag(tmp_path):
    app = create_app(database_path=tmp_path / "tracer.sqlite3")
    paths = app.openapi()["paths"]
    posting_paths = {
        path: operations
        for path, operations in paths.items()
        if path.startswith("/posting/")
    }

    assert {path: set(operations) for path, operations in posting_paths.items()} == {
        "/posting/import": {"get", "post"},
        "/posting/import/{import_key}": {"get", "delete"},
        "/posting/import/{import_key}/parse-results": {"post"},
        "/posting/card": {"get", "post"},
        "/posting/card/{card_key}": {"get", "patch", "delete"},
        "/posting/card/{card_key}/original": {"get"},
    }
    for operations in posting_paths.values():
        for operation in operations.values():
            assert operation["tags"] == ["postings"]

    assert paths["/settings"]["get"]["tags"] == ["settings"]
    assert paths["/settings/user"]["patch"]["tags"] == ["settings"]


@pytest.mark.parametrize("path", ["/posting-imports", "/posting-cards", "/import", "/card"])
def test_posting_routes_are_not_exposed_outside_the_prefix(tmp_path, path):
    with TestClient(create_app(database_path=tmp_path / "tracer.sqlite3")) as client:
        response = client.get(path)

    assert response.status_code == 404
