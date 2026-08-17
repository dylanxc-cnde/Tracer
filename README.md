# Tracer

[![CI](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml)

**Turn messy job pages into structured records you can actually review.**

Tracer is a small side project for internships, working-student roles, HiWi
jobs, and thesis openings in Germany. I am building it while learning more
about Python, LLM APIs, data modeling, and desktop apps.

```text
job URL or pasted text
-> AI retrieval and structured extraction
-> evidence, unknowns, and ambiguities
-> user review
-> confirmed Posting Card
```

## What works now

- Pydantic models for imports, parsed posting details, and confirmed cards;
- local SQLite storage for posting imports and confirmed cards;
- strict structured output through the OpenAI Responses API;
- source excerpts for extracted facts;
- multiple posting candidates without mixing in recommended jobs;
- grouped requirements such as `all_of`, `any_of`, and named examples;
- explicit ambiguities when a value cannot be classified safely.

Model output is always a proposal. Missing information stays unknown, and the
user reviews the result before it becomes a confirmed card.

## Run the tests

Tracer uses Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
```

## Try the parser

The public example uses a fictional job posting from
`examples/sample_posting.txt`.

Set `OPENAI_API_KEY` in your shell or in an ignored `.env.local` file, then
run:

```bash
uv run --env-file .env.local python examples/try_posting_parse.py
```

The example currently uses `gpt-5.6-luna` and requires at least one web search.
It sends the sample text to the OpenAI API and uses paid API credits.

Real job pages, API outputs, application records, and keys are not included in
the repository.

## Later

- a small TypeScript desktop interface for reviewing and editing cards;
- application status, emails, interviews, and next steps;
- candidate skills, managed skill tags, and explainable matching;
- CV and cover-letter versions;
- job discovery and application retrospectives.

Tracer will help organize and review applications, but it will not submit them
for the user.
