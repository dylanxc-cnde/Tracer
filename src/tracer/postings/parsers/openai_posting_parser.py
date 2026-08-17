from openai import OpenAI

from ..models.posting_import import (
    PostingImportRequest,
    TextImport,
    UrlImport,
)
from ..models.posting_parse import PostingParseResult
from .posting_parse_prompt import POSTING_PARSE_PROMPT


DEFAULT_OPENAI_POSTING_MODEL = "gpt-5.6-luna"


class OpenAIPostingParser:
    """Parse posting imports with the OpenAI Responses API.

    Args:
        client: The configured OpenAI client to use.
        model: The OpenAI model used for parsing.
    """

    def __init__(
        self,
        client: OpenAI,
        *,
        model: str = DEFAULT_OPENAI_POSTING_MODEL,
    ):
        self._client = client
        self._model = model

    def parse(
        self,
        request: PostingImportRequest,
    ) -> PostingParseResult:
        """Parse one posting import request.

        Args:
            request: The posting import request to parse.

        Returns:
            The structured posting parse result.
        """
        response = self._client.responses.parse(
            model=self._model,
            tools=[{"type": "web_search"}],
            tool_choice="required",
            include=["web_search_call.action.sources"],
            input=[
                {
                    "role": "system",
                    "content": POSTING_PARSE_PROMPT,
                },
                {
                    "role": "user",
                    "content": _build_user_content(request),
                },
            ],
            text_format=PostingParseResult,
        )

        result = response.output_parsed
        if result is None:
            raise RuntimeError(
                "OpenAI did not return a parsed PostingParseResult"
            )

        return result


def _build_user_content(request: PostingImportRequest) -> str:
    source = request.source

    if isinstance(source, TextImport):
        if source.source_url is None:
            return source.text

        return (
            f"Submitted source URL:\n{source.source_url}\n\n"
            f"Pasted posting text:\n{source.text}"
        )

    if isinstance(source, UrlImport):
        return f"Job posting URL:\n{source.url}"

    raise TypeError(f"Unsupported posting source: {type(source).__name__}")
