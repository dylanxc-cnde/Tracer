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
- an OpenAI Responses API parser with a shared prompt and strict structured output;
- a small FastAPI HTTP API for imports, parse results, and confirmed cards;
- a React and TypeScript frontend foundation with matching API contracts;
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

## Run the local API

```bash
uv run fastapi dev src/tracer/api/app.py
```

Open `http://127.0.0.1:8000/docs` to try the API in Swagger. The current
flow is:

```text
POST /posting-imports
GET  /posting-imports/{import_key}
POST /posting-imports/{import_key}/parse-results
POST /posting-cards
GET  /posting-cards/{card_key}
```

The local database is created at `.local/tracer.sqlite3`. Calling the parse
results endpoint requires an OpenAI API key and uses paid API credits.

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

- connect the TypeScript review interface to FastAPI;
- desktop packaging after the local web flow works;
- application status, emails, interviews, and next steps;
- candidate skills, managed skill tags, and explainable matching;
- CV and cover-letter versions;
- job discovery and application retrospectives.

Tracer will help organize and review applications, but it will not submit them
for the user.
