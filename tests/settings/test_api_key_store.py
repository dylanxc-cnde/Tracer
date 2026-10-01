import sys
import traceback
from types import ModuleType
from unittest.mock import Mock, PropertyMock
from uuid import UUID

import keyring
import pytest
from keyring.errors import KeyringLocked, PasswordDeleteError

from tracer.errors.settings_errors import ApiKeyStoreError
from tracer.settings import api_key_store
from tracer.settings.api_key_store import ApiKeyStore


TEST_PROVIDER_KEY = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
TEST_OTHER_PROVIDER_KEY = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
NATIVE_BACKENDS = (
    ("Darwin", "keyring.backends.macOS", "Keyring"),
    ("Windows", "keyring.backends.Windows", "WinVaultKeyring"),
    ("Linux", "keyring.backends.SecretService", "Keyring"),
)


def make_backend():
    credentials = {}
    backend = Mock(spec=["priority", "get_password", "set_password", "delete_password"])
    backend.priority = 5

    def get_password(service, username):
        return credentials.get((service, username))

    def set_password(service, username, password):
        credentials[(service, username)] = password

    def delete_password(service, username):
        if (service, username) not in credentials:
            raise PasswordDeleteError("test_missing_key")
        del credentials[(service, username)]

    backend.get_password.side_effect = get_password
    backend.set_password.side_effect = set_password
    backend.delete_password.side_effect = delete_password
    return backend


@pytest.fixture(autouse=True)
def native_backends(monkeypatch):
    # Replace every native backend so no test can access the real credential store.
    backends = {}
    for system, module_name, class_name in NATIVE_BACKENDS:
        module = ModuleType(module_name)
        backend = make_backend()
        factory = Mock(return_value=backend)
        setattr(module, class_name, factory)
        monkeypatch.setitem(sys.modules, module_name, module)
        backends[system] = (backend, factory)

    monkeypatch.setattr(api_key_store.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(
        keyring, "get_keyring", Mock(side_effect=AssertionError("test_auto_selection"))
    )
    return backends


def test_construction_does_not_initialize_or_access_storage(native_backends):
    ApiKeyStore()

    for backend, factory in native_backends.values():
        factory.assert_not_called()
        backend.get_password.assert_not_called()
        backend.set_password.assert_not_called()
        backend.delete_password.assert_not_called()


@pytest.mark.parametrize("system", ["Darwin", "Windows", "Linux"])
def test_crud_uses_only_the_native_backend(monkeypatch, native_backends, system):
    monkeypatch.setattr(api_key_store.platform, "system", lambda: system)
    monkeypatch.setenv("PYTHON_KEYRING_BACKEND", "keyrings.alt.file.PlaintextKeyring")
    backend, factory = native_backends[system]
    store = ApiKeyStore()

    assert store.get(TEST_PROVIDER_KEY) is None
    store.save(TEST_PROVIDER_KEY, "test_api_key")
    assert store.get(TEST_PROVIDER_KEY) == "test_api_key"
    assert store.delete(TEST_PROVIDER_KEY) is True
    assert store.get(TEST_PROVIDER_KEY) is None
    assert store.delete(TEST_PROVIDER_KEY) is False

    factory.assert_called_once_with()
    backend.set_password.assert_called_once_with(
        "tracer.api_keys", str(TEST_PROVIDER_KEY), "test_api_key"
    )
    backend.delete_password.assert_called_once_with("tracer.api_keys", str(TEST_PROVIDER_KEY))
    for other_system, (_, other_factory) in native_backends.items():
        if other_system != system:
            other_factory.assert_not_called()
    keyring.get_keyring.assert_not_called()


def test_save_replaces_only_the_matching_provider_and_survives_a_new_store():
    store = ApiKeyStore()
    store.save(TEST_PROVIDER_KEY, "test_shared_api_key")
    store.save(TEST_OTHER_PROVIDER_KEY, "test_shared_api_key")

    store.save(TEST_PROVIDER_KEY, "test_updated_api_key")
    reader = ApiKeyStore()

    assert reader.get(TEST_PROVIDER_KEY) == "test_updated_api_key"
    assert reader.get(TEST_OTHER_PROVIDER_KEY) == "test_shared_api_key"
    assert reader.delete(TEST_PROVIDER_KEY) is True
    assert reader.get(TEST_PROVIDER_KEY) is None
    assert reader.get(TEST_OTHER_PROVIDER_KEY) == "test_shared_api_key"


def test_get_does_not_cache_the_key():
    reader = ApiKeyStore()
    writer = ApiKeyStore()
    writer.save(TEST_PROVIDER_KEY, "test_first_api_key")
    assert reader.get(TEST_PROVIDER_KEY) == "test_first_api_key"

    writer.save(TEST_PROVIDER_KEY, "test_updated_api_key")
    assert reader.get(TEST_PROVIDER_KEY) == "test_updated_api_key"
    writer.delete(TEST_PROVIDER_KEY)
    assert reader.get(TEST_PROVIDER_KEY) is None


def test_save_preserves_nonempty_key_contents():
    store = ApiKeyStore()
    store.save(TEST_PROVIDER_KEY, " test_opaque_api_key ")

    assert store.get(TEST_PROVIDER_KEY) == " test_opaque_api_key "


@pytest.mark.parametrize(
    ("value", "error_type"),
    [
        (None, TypeError),
        (123, TypeError),
        (b"test_key", TypeError),
        ("", ValueError),
        (" \t\n", ValueError),
    ],
)
def test_invalid_api_keys_are_rejected_before_backend_initialization(
    native_backends, value, error_type
):
    with pytest.raises(error_type):
        ApiKeyStore().save(TEST_PROVIDER_KEY, value)

    native_backends["Darwin"][1].assert_not_called()


@pytest.mark.parametrize("operation", ["save", "get", "delete"])
@pytest.mark.parametrize("provider_key", [None, str(TEST_PROVIDER_KEY)])
def test_provider_key_must_be_a_uuid(native_backends, operation, provider_key):
    store = ApiKeyStore()
    args = (provider_key, "test_api_key") if operation == "save" else (provider_key,)

    with pytest.raises(TypeError, match="provider_key must be a UUID"):
        getattr(store, operation)(*args)

    native_backends["Darwin"][1].assert_not_called()


def test_unsupported_platform_does_not_try_a_backend(monkeypatch, native_backends):
    monkeypatch.setattr(api_key_store.platform, "system", lambda: "test_unsupported_os")

    with pytest.raises(ApiKeyStoreError, match="not supported"):
        ApiKeyStore().get(TEST_PROVIDER_KEY)

    for _, factory in native_backends.values():
        factory.assert_not_called()


@pytest.mark.parametrize("system", ["Darwin", "Windows", "Linux"])
@pytest.mark.parametrize("failure", ["import", "initialization", "priority", "inactive"])
def test_unavailable_backend_fails_without_fallback(
    monkeypatch, native_backends, system, failure
):
    monkeypatch.setattr(api_key_store.platform, "system", lambda: system)
    backend, factory = native_backends[system]
    module_name = next(item[1] for item in NATIVE_BACKENDS if item[0] == system)
    if failure == "import":
        monkeypatch.setitem(sys.modules, module_name, None)
    elif failure == "initialization":
        factory.side_effect = RuntimeError("test_backend_details")
    elif failure == "priority":
        monkeypatch.setattr(
            type(backend), "priority",
            PropertyMock(side_effect=RuntimeError("test_backend_details")),
            raising=False,
        )
    else:
        backend.priority = 0

    with pytest.raises(ApiKeyStoreError) as raised:
        ApiKeyStore().get(TEST_PROVIDER_KEY)

    assert "test_backend_details" not in "".join(traceback.format_exception(raised.value))
    for other_system, (other_backend, other_factory) in native_backends.items():
        other_backend.get_password.assert_not_called()
        if other_system != system:
            other_factory.assert_not_called()


@pytest.mark.parametrize(
    ("operation", "backend_method"),
    [
        ("save", "set_password"),
        ("get", "get_password"),
        ("delete", "get_password"),
        ("delete", "delete_password"),
    ],
)
@pytest.mark.parametrize("error_type", [KeyringLocked, PasswordDeleteError, OSError])
def test_backend_failures_are_not_missing_keys_and_do_not_expose_error_details(
    native_backends, operation, backend_method, error_type
):
    backend, factory = native_backends["Darwin"]
    store = ApiKeyStore()
    store.save(TEST_PROVIDER_KEY, "test_secret_api_key")
    getattr(backend, backend_method).side_effect = error_type("test_secret_api_key")
    args = (
        (TEST_PROVIDER_KEY, "test_secret_api_key")
        if operation == "save" else (TEST_PROVIDER_KEY,)
    )

    with pytest.raises(ApiKeyStoreError) as raised:
        getattr(store, operation)(*args)

    assert raised.value.code == "settings.api_key_store_error"
    assert "test_secret_api_key" not in str(raised.value)
    assert "test_secret_api_key" not in str(raised.value.as_dict())
    assert "test_secret_api_key" not in "".join(traceback.format_exception(raised.value))
    factory.assert_called_once_with()
    for other_system, (_, other_factory) in native_backends.items():
        if other_system != "Darwin":
            other_factory.assert_not_called()
    if operation == "delete" and backend_method == "get_password":
        backend.delete_password.assert_not_called()
