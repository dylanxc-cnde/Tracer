from pathlib import Path
from openai import OpenAI

from tracer.postings import PostingParseResult
from tracer.postings.parsers.posting_parse_prompt import (
    POSTING_PARSE_PROMPT,
)


posting_text = Path(__file__).with_name("sample_posting.txt").read_text(
    encoding="utf-8"
)

print(f"Loaded {len(posting_text)} characters.")
print(f"Output model: {PostingParseResult.__name__}")

client = OpenAI()

print("OpenAI client is ready.")

print("Sending posting to OpenAI...")


response = client.responses.parse(
    model="gpt-5.6-luna",
    tools=[
        {"type": "web_search"},
    ],
    tool_choice="required",
    include=["web_search_call.action.sources"],
    input=[
        {
            "role": "system",
            "content": POSTING_PARSE_PROMPT,
        },
        {
            "role": "user",
            "content": posting_text,
        },
    ],
    text_format=PostingParseResult,
)

result = response.output_parsed

if result is None:
    print(response.output_text)
    raise RuntimeError("OpenAI did not return a parsed PostingParseResult.")

print("Web search actions:")
for item in response.output:
    if item.type == "web_search_call":
        print(item.action.model_dump_json(indent=2, exclude_none=True))

print(result.model_dump_json(indent=2))
print("Response items:", [item.type for item in response.output])
