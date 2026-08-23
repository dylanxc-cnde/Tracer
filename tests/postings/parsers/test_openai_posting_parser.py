from types import SimpleNamespace
from uuid import UUID

import pytest

from tracer.postings.models.posting_import import PostingImportRequest
from tracer.postings.models.posting_parse import (
    PostingParseResult,
    PostingParseStatus,
    PostingRefinementReason,
)
from tracer.postings.parsers.openai_posting_parser import (
    OpenAIPostingParser,
)
from tracer.postings.parsers.posting_parse_prompt import (
    POSTING_PARSE_PROMPT,
)


IMPORT_KEY = UUID("c0caad62-902e-4fe0-bc44-82b7d40ac838")


class FakeResponses:
    def __init__(self, output_parsed):
        self._output_parsed = output_parsed
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=self._output_parsed)


class FakeOpenAI:
    def __init__(self, output_parsed):
        self.responses = FakeResponses(output_parsed)


def make_result() -> PostingParseResult:
    return PostingParseResult(
        status=PostingParseStatus.NOT_FOUND,
        postings=(),
        refinement_reason=None,
        refinement_suggestions=(),
    )


def test_shared_prompt_defines_every_parse_status_and_refinement_reason():
    for status in PostingParseStatus:
        assert status.value in POSTING_PARSE_PROMPT

    for reason in PostingRefinementReason:
        assert reason.value in POSTING_PARSE_PROMPT

    assert "Set origin to source" in POSTING_PARSE_PROMPT
    assert "Never set origin to user_defined" in POSTING_PARSE_PROMPT


def test_shared_prompt_uses_requirement_strategy_without_scenarios():
    prompt = " ".join(POSTING_PARSE_PROMPT.split())

    assert "Parse each source requirement in this order" in prompt
    assert "Segment the source statement" in prompt
    assert "applies only to the capability or clause that it modifies" in prompt
    assert "Do not downgrade an unqualified broader requirement" in prompt
    assert "assign each its own importance" in prompt
    assert "compact UI pill label, not a copied sentence or clause" in prompt
    assert "short noun phrase in the source language" in prompt
    assert "Preserve qualifiers that affect matching" in prompt
    assert "complete original wording only in PostingRequirements.source" in prompt
    assert "Lists and conjunctions do not prove any_of by themselves" in prompt
    assert "Illustration items do not determine item_rule" in prompt
    assert "Use all_of when there is one core item" in prompt
    assert "Run a consistency check" in prompt
    assert "Requirement.text" not in POSTING_PARSE_PROMPT
    assert 'Example: "' not in POSTING_PARSE_PROMPT
    assert "By contrast," not in POSTING_PARSE_PROMPT
    assert "For example," not in POSTING_PARSE_PROMPT


def test_shared_prompt_uses_one_source_bundle_per_section():
    prompt = " ".join(POSTING_PARSE_PROMPT.split())

    assert "Each PostingDetails section owns exactly one PostingSource" in prompt
    assert "do not create or imply a field-to-excerpt" in prompt
    assert "Multiple URLs are allowed" in prompt
    assert "SourceExcerpt" not in POSTING_PARSE_PROMPT


def test_parser_sends_text_import_with_shared_prompt():
    expected_result = make_result()
    client = FakeOpenAI(expected_result)
    parser = OpenAIPostingParser(client)
    request = PostingImportRequest(
        import_key=IMPORT_KEY,
        source={
            "kind": "text",
            "text": "Example posting text.",
            "source_url": "https://example.com/jobs/data",
        },
    )

    result = parser.parse(request)

    assert result == expected_result
    assert client.responses.calls == [
        {
            "model": "gpt-5.6-luna",
            "tools": [{"type": "web_search"}],
            "tool_choice": "required",
            "include": ["web_search_call.action.sources"],
            "input": [
                {
                    "role": "system",
                    "content": POSTING_PARSE_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "Submitted source URL:\n"
                        "https://example.com/jobs/data\n\n"
                        "Pasted posting text:\n"
                        "Example posting text."
                    ),
                },
            ],
            "text_format": PostingParseResult,
        }
    ]


def test_parser_sends_url_import_with_selected_model():
    expected_result = make_result()
    client = FakeOpenAI(expected_result)
    parser = OpenAIPostingParser(client, model="test-model")
    request = PostingImportRequest(
        import_key=IMPORT_KEY,
        source={
            "kind": "url",
            "url": "https://example.com/jobs/data",
        },
    )

    result = parser.parse(request)

    assert result == expected_result
    call = client.responses.calls[0]
    assert call["model"] == "test-model"
    assert call["input"][1] == {
        "role": "user",
        "content": "Job posting URL:\nhttps://example.com/jobs/data",
    }


def test_parser_raises_when_openai_returns_no_parsed_result():
    client = FakeOpenAI(None)
    parser = OpenAIPostingParser(client)
    request = PostingImportRequest(
        import_key=IMPORT_KEY,
        source={
            "kind": "text",
            "text": "Example posting text.",
        },
    )

    with pytest.raises(
        RuntimeError,
        match="OpenAI did not return a parsed PostingParseResult",
    ):
        parser.parse(request)
