from collections.abc import Callable, Iterator
from contextlib import contextmanager

from openai import OpenAI

from tracer.errors.settings_errors import PostingParserConfigurationError
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.models import POSTING_PARSE_TASK, AIProvider
from tracer.settings.settings_store import SettingsStore

from ..parsers.openai_posting_parser import OpenAIPostingParser


class ResolvePostingParserService:
    """Resolve committed settings per request without caching models or secrets.

    Reading one snapshot keeps its provider and task selection together. Settings
    may change after this read; in-flight parsing is not cancelled or retargeted.
    No settings write lock is held across credential access or provider calls.
    """

    def __init__(
        self,
        settings_store: SettingsStore,
        api_key_store: ApiKeyStore,
        *,
        client_factory: Callable[..., OpenAI],
    ):
        self._settings_store = settings_store
        self._api_key_store = api_key_store
        self._client_factory = client_factory

    @contextmanager
    def resolve(self) -> Iterator[OpenAIPostingParser]:
        """Create an owned client only for an explicit parse, then close it."""
        try:
            settings = self._settings_store.get()
        except Exception:
            # Corrupt/unreadable settings are not evidence of an unset selection.
            raise PostingParserConfigurationError(
                "Could not read valid posting parsing settings."
            ) from None

        selection = None
        if settings is not None:
            selection = next(
                (task for task in settings.ai.tasks if task.task == POSTING_PARSE_TASK),
                None,
            )

        if selection is None:
            # Only a genuinely absent selection opts into the existing environment
            # credential and the parser's built-in default model.
            client = self._client_factory()
            parser = OpenAIPostingParser(client)
        else:
            provider = next(
                (p for p in settings.ai.providers if p.provider_key == selection.provider_key),
                None,
            )
            if provider is None or provider.provider != AIProvider.OPENAI:
                raise PostingParserConfigurationError(
                    "The selected posting parsing provider is unavailable or unsupported."
                )
            try:
                api_key = self._api_key_store.get(provider.provider_key)
            except Exception:
                raise PostingParserConfigurationError(
                    "Could not read the selected provider's API key."
                ) from None
            if not isinstance(api_key, str) or not api_key.strip():
                raise PostingParserConfigurationError(
                    "The selected provider has no usable API key."
                )
            # Passing the selected secret explicitly prevents environment-key
            # fallback. This does not validate model availability or credentials.
            client = self._client_factory(api_key=api_key)
            parser = OpenAIPostingParser(client, model=selection.model)

        try:
            yield parser
        finally:
            # Only clients created here are owned here, never injected parsers.
            # Cleanup failures must not replace a result or expose SDK details.
            try:
                client.close()
            except Exception:
                pass
