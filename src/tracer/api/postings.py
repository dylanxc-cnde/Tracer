from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from openai import OpenAI

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
from tracer.postings.services.update_posting_card import (
    UpdatePostingCardService,
)
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.postings.stores.posting_import_request_store import (
    PostingImportRequestStore,
)

from .models import CreatePostingCardRequest, UpdatePostingCardRequest


def create_postings_router(
    *,
    database_path: Path,
    posting_parser: OpenAIPostingParser | None = None,
) -> APIRouter:
    """Create the routes for posting imports and cards.

    Args:
        database_path: The SQLite database file to use.
        posting_parser: An optional parser supplied by tests or the caller.

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
    router = APIRouter(tags=["postings"])

    def get_posting_import(import_key: UUID) -> PostingImportRequest:
        request = posting_import_request_store.get(import_key)
        if request is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting import not found",
            )

        return request

    def get_posting_parser() -> OpenAIPostingParser:
        nonlocal posting_parser

        if posting_parser is None:
            posting_parser = OpenAIPostingParser(OpenAI())

        return posting_parser

    @router.post(
        "/posting-imports",
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

    @router.get("/posting-imports")
    def read_posting_imports() -> tuple[PostingImportRequest, ...]:
        return posting_import_request_store.get_all()

    @router.get("/posting-imports/{import_key}")
    def read_posting_import(
        import_key: UUID,
    ) -> PostingImportRequest:
        return get_posting_import(import_key)

    @router.delete(
        "/posting-imports/{import_key}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_posting_import(import_key: UUID) -> None:
        if not posting_import_request_store.delete(import_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting import not found",
            )

    @router.post("/posting-imports/{import_key}/parse-results")
    def create_posting_parse_result(
        import_key: UUID,
    ) -> PostingParseResult:
        request = get_posting_import(import_key)

        return get_posting_parser().parse(request)

    @router.post(
        "/posting-cards",
        status_code=status.HTTP_201_CREATED,
    )
    def create_posting_card(
        request: CreatePostingCardRequest,
    ) -> PostingCard:
        get_posting_import(request.import_key)

        return create_posting_card_service.create(
            import_key=request.import_key,
            posting=request.posting,
            posting_alias=request.posting_alias,
            user_notes=request.user_notes,
            tags=request.tags,
        )

    @router.get("/posting-cards/{card_key}")
    def read_posting_card(card_key: UUID) -> PostingCard:
        card = posting_card_store.get_by_card_key(card_key)
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

        return card

    @router.get("/posting-cards")
    def read_posting_cards() -> tuple[PostingCard, ...]:
        return posting_card_store.get_all()

    @router.patch("/posting-cards/{card_key}")
    def update_posting_card(
        card_key: UUID,
        request: UpdatePostingCardRequest,
    ) -> PostingCard:
        card = update_posting_card_service.update_user_content(
            card_key=card_key,
            posting_alias=request.posting_alias,
            user_notes=request.user_notes,
            tags=request.tags,
        )
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

        return card

    @router.delete(
        "/posting-cards/{card_key}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_posting_card(card_key: UUID) -> None:
        if not posting_card_store.delete(card_key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Posting card not found",
            )

    return router
