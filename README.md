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
-> user selects a posting
-> confirmed Posting Card in SQLite
```

## What works now

- Pydantic models for imports, parsed posting details, and confirmed cards;
- local SQLite storage for posting imports and confirmed cards;
- an OpenAI Responses API parser with a shared prompt and strict structured output;
- a small FastAPI HTTP API for imports, parse results, and confirmed cards;
- a working React and TypeScript browser flow from pasted text to a saved card;
- local Card and Import libraries that reload records from SQLite;
- explicit, confirmed deletion for saved Cards and Import history;
- selectable posting candidates with loading, error, and confirmation states;
- source excerpts for extracted facts;
- multiple posting candidates without mixing in recommended jobs;
- grouped requirements such as `all_of`, `any_of`, and named examples;
- explicit ambiguities when a value cannot be classified safely.

Model output is always a proposal. Missing information stays unknown, and the
user reviews the result before it becomes a confirmed card.

## Run the checks

Tracer uses Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
```

```bash
cd frontend
npm ci
npm run lint
npm run build
```

## Run the local app

Start FastAPI from the repository root:

```bash
uv run --env-file .env.local fastapi dev src/tracer/api/app.py
```

Then start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Paste a posting, analyze it, select one candidate,
and confirm it to create a saved Posting Card. Open
`http://127.0.0.1:8000/docs` to inspect the API directly.

The current HTTP flow is:

```text
POST /posting-imports
GET  /posting-imports
GET  /posting-imports/{import_key}
DELETE /posting-imports/{import_key}
POST /posting-imports/{import_key}/parse-results
POST /posting-cards
GET  /posting-cards
GET  /posting-cards/{card_key}
DELETE /posting-cards/{card_key}
```

The local database is created at `.local/tracer.sqlite3`. Calling Analyze
requires an OpenAI API key and uses paid API credits. If the key is already
exported in the shell, the `--env-file .env.local` option is not needed.

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

## Next

- reopen one saved Card and inspect its full details and evidence;
- add Card editing later, once the user-owned and evidence-backed fields have
  clear update rules;
- show the relationship between an Import and the Cards created from it;
- give the Card and Import pages a simple, usable layout.

Deleting a Card does not delete its original Import. Deleting an Import does
not delete saved Cards either: a Card keeps its `import_key` as historical
context, and code that follows the reference must handle a missing Import.

After that, the next product layer is a small Candidate Profile, job-search
goals, and explainable requirement matching. Tracer should ask for extra
preferences only when a feature needs them—for example, Anschreiben tone when
the user first creates an Anschreiben—not through one large setup form.

Longer-term experiments include a budget-aware daily job brief, application
planning around a desired start date, materials and application timelines, and
a single-OS desktop alpha. Search and personal evaluation will stay separate so
that old companies and keywords do not quietly narrow every new search.

Tracer will help organize and review applications, but it will not submit them
for the user.
