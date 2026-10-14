import sqlite3
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.errors.settings_errors import ApiKeyStoreError
from tracer.postings import PostingImportRequest, PostingParseResult
from tracer.postings.parsers.openai_posting_parser import DEFAULT_OPENAI_POSTING_MODEL
from tracer.settings.models import (
    AIProvider,
    AIProviderSettings,
    AISettings,
    AITaskSettings,
    AppSettings,
)
from tracer.settings.settings_store import SettingsStore

from tests.api.factories import FakePostingParser, make_parse_result


class FakeParseResponse:
    """A minimal OpenAI Responses parse result exposing output_parsed."""

    def __init__(self, output_parsed):
        self.output_parsed = output_parsed


class FakeResponses:
    def __init__(self, client):
        self._client = client

    def parse(self, **kwargs):
        self._client.parse_calls.append(kwargs)
        if self._client.parse_error is not None:
            raise self._client.parse_error
        return FakeParseResponse(self._client.parse_result)


class FakeOpenAIClient:
    def __init__(self, *, api_key, parse_result, parse_error):
        self.api_key = api_key
        self.parse_calls = []
        self.parse_result = parse_result
        self.parse_error = parse_error
        self.closed = False
        self.responses = FakeResponses(self)

    def close(self):
        self.closed = True


class FakeOpenAIFactory:
    """Records every client construction and parse call for detection assertions."""

    def __init__(self):
        self.clients = []
        self.parse_result = make_parse_result()
        self.parse_error = None

    def __call__(self, **kwargs):
        client = FakeOpenAIClient(
            api_key=kwargs.get("api_key"),
            parse_result=self.parse_result,
            parse_error=self.parse_error,
        )
        self.clients.append(client)
        return client


class FakeKeyStore:
    def __init__(self):
        self.credentials = {}
        self.fail_get = False
        self.get_calls = []
        self.save_calls = []
        self.delete_calls = []

    def get(self, provider_key):
        self.get_calls.append(provider_key)
        if self.fail_get:
            raise ApiKeyStoreError("test_get_failure")
        return self.credentials.get(provider_key)

    def save(self, provider_key, api_key):
        self.save_calls.append((provider_key, api_key))
        self.credentials[provider_key] = api_key

    def delete(self, provider_key):
        self.delete_calls.append(provider_key)
        return self.credentials.pop(provider_key, None) is not None


@pytest.fixture(autouse=True)
def block_system_credentials(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Posting settings tests must not access the system credential store")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)


@pytest.fixture
def key_store():
    return FakeKeyStore()


@pytest.fixture
def openai_factory(monkeypatch):
    factory = FakeOpenAIFactory()
    monkeypatch.setattr("tracer.api.postings.OpenAI", factory)
    return factory


@pytest.fixture
def client(tmp_path, key_store):
    app = create_app(database_path=tmp_path / "test.sqlite3", api_key_store=key_store)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def create_openai_provider(client, api_key):
    response = client.post(
        "/settings/ai/providers",
        json={"provider": "openai", "display_name": "test_provider", "api_key": api_key},
    )
    assert response.status_code == 201
    return response.json()["provider_key"]


def create_import(client):
    response = client.post(
        "/posting/import",
        json={"kind": "text", "text": "Working student posting text.", "source_url": None},
    )
    assert response.status_code == 201
    return response.json()["import_key"]


def test_configured_selection_drives_parse_with_selected_key_and_model(
    client, key_store, openai_factory
):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")

    assert parse.status_code == 200
    assert PostingParseResult.model_validate(parse.json()) == make_parse_result()
    assert len(openai_factory.clients) == 1
    built = openai_factory.clients[0]
    assert built.api_key == "test_secret_key_A"
    assert [call["model"] for call in built.parse_calls] == ["test_parse_model"]
    assert built.closed is True
    # The secret travels only through the constructor, never into parse kwargs.
    assert "api_key" not in built.parse_calls[0]


def test_changing_model_and_key_affects_next_parse_without_stale_cache(
    client, key_store, openai_factory
):
    provider_key = create_openai_provider(client, "test_key_old")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_model_first"},
    ).status_code == 200

    first = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert first.status_code == 200
    assert openai_factory.clients[0].api_key == "test_key_old"
    assert openai_factory.clients[0].parse_calls[0]["model"] == "test_model_first"

    # Change only the model, then only the key; each next parse observes it.
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_model_second"},
    ).status_code == 200
    second = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert second.status_code == 200
    assert openai_factory.clients[1].api_key == "test_key_old"
    assert openai_factory.clients[1].parse_calls[0]["model"] == "test_model_second"

    assert client.put(
        f"/settings/ai/providers/{provider_key}/api-key",
        json={"api_key": "test_key_new"},
    ).status_code == 204
    third = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert third.status_code == 200
    assert openai_factory.clients[2].api_key == "test_key_new"
    assert openai_factory.clients[2].parse_calls[0]["model"] == "test_model_second"

    assert len(openai_factory.clients) == 3


def test_two_providers_use_their_own_selected_keys(client, openai_factory):
    first_key = create_openai_provider(client, "test_key_provider_one")
    second_key = create_openai_provider(client, "test_key_provider_two")

    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": first_key, "model": "test_model_one"},
    ).status_code == 200
    parse_one = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert parse_one.status_code == 200
    assert openai_factory.clients[0].api_key == "test_key_provider_one"
    assert openai_factory.clients[0].parse_calls[0]["model"] == "test_model_one"

    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": second_key, "model": "test_model_two"},
    ).status_code == 200
    parse_two = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert parse_two.status_code == 200
    assert openai_factory.clients[1].api_key == "test_key_provider_two"
    assert openai_factory.clients[1].parse_calls[0]["model"] == "test_model_two"


def test_clear_selection_returns_to_default_environment_path(client, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200

    configured = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert configured.status_code == 200
    assert openai_factory.clients[0].api_key == "test_secret_key_A"

    assert client.delete("/settings/ai/tasks/posting_parse").status_code == 204
    defaulted = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert defaulted.status_code == 200
    assert len(openai_factory.clients) == 2
    assert openai_factory.clients[1].api_key is None
    assert openai_factory.clients[1].parse_calls[0]["model"] == DEFAULT_OPENAI_POSTING_MODEL


def test_explicit_parser_injection_does_not_read_credentials(
    tmp_path, key_store, openai_factory
):
    parser = FakePostingParser(make_parse_result())
    app = create_app(
        database_path=tmp_path / "test.sqlite3",
        posting_parser=parser,
        api_key_store=key_store,
    )
    with TestClient(app, raise_server_exceptions=False) as client:
        provider_key = create_openai_provider(client, "test_secret_key_A")
        assert client.put(
            "/settings/ai/tasks/posting_parse",
            json={"provider_key": provider_key, "model": "test_parse_model"},
        ).status_code == 200
        import_response = client.post(
            "/posting/import",
            json={"kind": "text", "text": "Working student posting text.", "source_url": None},
        )
        assert import_response.status_code == 201
        parse = client.post(
            f"/posting/import/{import_response.json()['import_key']}/parse-results"
        )

    assert parse.status_code == 200
    assert PostingParseResult.model_validate(parse.json()) == parser.result
    assert parser.requests == [PostingImportRequest.model_validate(import_response.json())]
    assert openai_factory.clients == []
    # No credential was read despite a saved selection and stored key.
    assert key_store.get_calls == []


def test_configured_but_missing_key_fails_without_provider_call(client, key_store, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200
    key_store.credentials.pop(UUID(provider_key))

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")

    assert parse.status_code == 503
    assert parse.json()["detail"]["code"] == "settings.posting_parser_configuration_error"
    assert "test_secret_key_A" not in parse.text
    assert openai_factory.clients == []


def test_key_store_read_failure_fails_without_provider_call(client, key_store, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200
    key_store.fail_get = True

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")

    assert parse.status_code == 503
    assert parse.json()["detail"]["code"] == "settings.posting_parser_configuration_error"
    assert "test_get_failure" not in parse.text
    assert openai_factory.clients == []


def test_corrupt_settings_fail_without_provider_call(client, openai_factory, tmp_path):
    import_key = create_import(client)
    with sqlite3.connect(tmp_path / "test.sqlite3") as connection:
        connection.execute(
            "INSERT INTO app_settings(settings_key, payload_json) VALUES('app', ?)",
            ("test_invalid_json",),
        )

    parse = client.post(f"/posting/import/{import_key}/parse-results")

    assert parse.status_code == 503
    assert parse.json()["detail"]["code"] == "settings.posting_parser_configuration_error"
    assert openai_factory.clients == []


def test_persisted_unsupported_platform_fails_without_provider_call(
    client, key_store, openai_factory, tmp_path
):
    provider_key = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    SettingsStore(tmp_path / "test.sqlite3").save(
        AppSettings(
            ai=AISettings(
                providers=(
                    AIProviderSettings(
                        provider_key=provider_key,
                        provider=AIProvider.DEEPSEEK,
                        display_name="test_deepseek",
                    ),
                ),
                tasks=(
                    AITaskSettings(
                        task="posting_parse", provider_key=provider_key, model="test_model"
                    ),
                ),
            )
        )
    )

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")

    assert parse.status_code == 503
    assert parse.json()["detail"]["code"] == "settings.posting_parser_configuration_error"
    assert openai_factory.clients == []
    assert key_store.get_calls == []


def test_config_operations_do_not_construct_provider_client(client, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model_two"},
    ).status_code == 200
    assert client.delete("/settings/ai/tasks/posting_parse").status_code == 204

    assert openai_factory.clients == []


def test_parse_does_not_auto_create_card(client, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")
    assert parse.status_code == 200

    cards = client.get("/posting/card")
    assert cards.status_code == 200
    assert cards.json() == []


def test_sdk_error_is_sanitized_without_leaking_secrets(client, openai_factory):
    provider_key = create_openai_provider(client, "test_secret_key_A")
    assert client.put(
        "/settings/ai/tasks/posting_parse",
        json={"provider_key": provider_key, "model": "test_parse_model"},
    ).status_code == 200
    openai_factory.parse_error = RuntimeError("test_secret_key_A test_sdk_failure")

    parse = client.post(f"/posting/import/{create_import(client)}/parse-results")

    assert parse.status_code == 502
    assert parse.json()["detail"]["code"] == "posting.parse_failed"
    assert "test_secret_key_A" not in parse.text
    assert "test_sdk_failure" not in parse.text
    assert openai_factory.clients[0].closed is True
