import sqlite3
from pathlib import Path
from typing import Callable, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from openai import OpenAI

from tracer.errors.settings_errors import PostingParserConfigurationError
from tracer.postings import (
    PostingCard,
    PostingImportRequest,
    PostingImportSource,
    PostingParseResult,
)
from tracer.postings.parsers.openai_posting_parser import (
    OpenAIPostingParser,
)
from tracer.postings.services.create_posting_card import (
    CreatePostingCardService,
)
from tracer.postings.services.resolve_posting_parser import ResolvePostingParserService
from tracer.postings.services.update_posting_card import (
    UpdatePostingCardService,
)
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.postings.stores.posting_import_request_store import (
    PostingImportRequestStore,
)
from tracer.settings.api_key_store import ApiKeyStore
from tracer.settings.settings_store import SettingsStore

from .models.posting_models import CreatePostingCardRequest, UpdatePostingCardRequest


def create_postings_router(
    *,
    database_path: Path,
    posting_parser: OpenAIPostingParser | None = None,
    api_key_store: ApiKeyStore | None = None,
    activity_hook: Callable[[Literal["card_saved", "card_updated"], PostingCard], None] | None = None,
) -> APIRouter:
    """Create the routes for posting imports and cards.

    Args:
        database_path: The SQLite database file to use.
        posting_parser: An optional parser supplied by tests or the caller.
        api_key_store: Optional shared, lazily initialized credential storage.
        activity_hook: Optional best-effort recorder, called after committed Card writes.

    Returns:
        The configured postings router.
    """
    posting_import_request_store = PostingImportRequestStore(database_path)
    posting_card_store = PostingCardStore(database_path)
    create_posting_card_service = CreatePostingCardService(
        posting_card_store
    )
    update_posting_card_service = UpdatePostingCardService(
        posting_card_store
    )
    router = APIRouter(prefix="/posting", tags=["postings"])
    resolve_posting_parser_service = ResolvePostingParserService(
        SettingsStore(database_path),
        api_key_store if api_key_store is not None else ApiKeyStore(),
        # Keep client creation lazy and use the same constructor boundary as the
        # existing runtime, including callers that replace it with a fake SDK.
        client_factory=lambda **kwargs: OpenAI(**kwargs),
    )

    def record_activity(kind: Literal["card_saved", "card_updated"], card: PostingCard) -> None:
        if activity_hook is not None:
            try:
                activity_hook(kind, card)
            except sqlite3.Error:
                # The Card is already committed. Activity is not a second save
                # prerequisite, and raw database errors may contain private data.
                pass

    def get_posting_import(import_key: UUID) -> PostingImportRequest:
        request = posting_import_request_store.get(import_key)
        if request is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting import not found",
            )

        return request

    @router.post(
        "/import",
        status_code=status.HTTP_201_CREATED,
    )
    def create_posting_import(
        source: PostingImportSource,
    ) -> PostingImportRequest:
        request = PostingImportRequest(
            import_key=uuid4(),
            source=source,
        )
        posting_import_request_store.add(request)

        return request

    @router.get("/import")
    def read_posting_imports() -> tuple[PostingImportRequest, ...]:
        return posting_import_request_store.get_all()

    @router.get("/import/{import_key}")
    def read_posting_import(
        import_key: UUID,
    ) -> PostingImportRequest:
        return get_posting_import(import_key)

    @router.delete(
        "/import/{import_key}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_posting_import(import_key: UUID) -> None:
        if not posting_import_request_store.delete(import_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting import not found",
            )

    @router.post("/import/{import_key}/parse-results")
    def create_posting_parse_result(
        import_key: UUID,
    ) -> PostingParseResult:
        request = get_posting_import(import_key)

        try:
            # Explicit parser injection remains authoritative and does not read
            # settings or credentials, even if the saved configuration is invalid.
            if posting_parser is not None:
                return posting_parser.parse(request)
            with resolve_posting_parser_service.resolve() as parser:
                return parser.parse(request)
        except PostingParserConfigurationError:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": PostingParserConfigurationError.code,
                    "message": "Posting parsing settings or credentials are unavailable. Review Settings and try again.",
                    "context": {},
                },
            ) from None
        except Exception:
            # SDK errors can contain API keys, private posting text or response
            # bodies. Return a fixed message without logging or serializing them.
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "posting.parse_failed",
                    "message": "Could not parse the posting. Check your parsing configuration and try again.",
                    "context": {},
                },
            ) from None

    @router.post(
        "/card",
        status_code=status.HTTP_201_CREATED,
    )
    def create_posting_card(
        request: CreatePostingCardRequest,
    ) -> PostingCard:
        get_posting_import(request.import_key)

        card = create_posting_card_service.create(
            import_key=request.import_key,
            posting=request.posting,
            posting_alias=request.posting_alias,
            user_notes=request.user_notes,
            tags=request.tags,
        )
        record_activity("card_saved", card)
        return card

    @router.get("/card/{card_key}")
    def read_posting_card(card_key: UUID) -> PostingCard:
        card = posting_card_store.get_by_card_key(card_key)
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

        return card

    @router.get("/card/{card_key}/original")
    def read_original_posting_card(card_key: UUID) -> PostingCard:
        card = posting_card_store.get_original_by_card_key(card_key)
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

        return card

    @router.get("/card")
    def read_posting_cards() -> tuple[PostingCard, ...]:
        return posting_card_store.get_all()

    @router.patch("/card/{card_key}")
    def update_posting_card(
        card_key: UUID,
        request: UpdatePostingCardRequest,
    ) -> PostingCard:
        previous = posting_card_store.get_by_card_key(card_key) if activity_hook is not None else None
        card = update_posting_card_service.update_user_content(
            card_key=card_key,
            request=request,
        )
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

        if previous is not None and card != previous:
            record_activity("card_updated", card)
        return card

    @router.delete(
        "/card/{card_key}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_posting_card(card_key: UUID) -> None:
        if not posting_card_store.delete(card_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

    return router
