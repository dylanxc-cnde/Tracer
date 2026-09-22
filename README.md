# Tracer

[![CI](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml)

**Turn messy job pages into job cards you can actually review.**

Tracer is a local-first job-search workspace, built with internships,
working-student roles, HiWi jobs, and thesis openings in Germany in mind.
Paste a posting, review what the AI picked out, and keep the useful parts
together—with sources, your corrections, tags, and notes.

Less digging through job pages. More time deciding which roles are worth a look.

## A look inside

These screenshots use a fictional posting. They show the reading layout;
newer features such as inline editing and Show original aren't pictured yet.

| Overview | Requirements |
| --- | --- |
| [![Card overview](docs/images/card_overview.png)](docs/images/card_overview.png) | [![Requirements](docs/images/card_requirements.png)](docs/images/card_requirements.png) |
| Work conditions and salary | Application details and notes |
| [![Work conditions](docs/images/card_workconditions.png)](docs/images/card_workconditions.png) | [![Application details](docs/images/card_application.png)](docs/images/card_application.png) |

## What you can do now

- Import pasted posting text, review AI-extracted candidates, and save a Card.
  URL imports are also available through the API.
- Reopen Cards from a local SQLite library and check their source excerpts.
- Edit titles, company names, posting information, responsibilities, requirements,
  compensation, application details, contacts, company information, and personal notes.
- Add, edit, and delete requirement pills, including switching them to examples.
- Save everything together, cancel a draft, or view the initial Card snapshot.

Quick Facts stays a read-only summary. Requirement categories are also read-only
for now; moving pills or groups and changing existing group rules are deferred.
Failed saves keep your draft, and editing never overwrites the initial snapshot.

The browser app currently has Import Posting, Card Library, and Import History.
It's a working prototype, not yet a packaged desktop app.

## Run locally

You'll need Python 3.12, [uv](https://docs.astral.sh/uv/), and Node.js 22.

From the repository root, put `OPENAI_API_KEY=your-key` in an ignored
`.env.local` file, then start the backend:

```bash
uv sync
uv run --env-file .env.local fastapi dev src/tracer/api/app.py
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. API docs are at **http://127.0.0.1:8000/docs**.
In Card Library or Import History, use the Load button to fetch saved records.

Analyze sends the posting input to OpenAI and uses paid API credits.
Saved records live in `.local/tracer.sqlite3`; older database schemas need a
manual, backed-up migration. Automatic upgrades aren't available yet.

## Development

The stack is React + TypeScript + Vite, FastAPI + Pydantic, and SQLite.
Parsing uses the OpenAI Responses API. A fictional parser example lives in
[examples/try_posting_parse.py](examples/try_posting_parse.py).

The interface uses [PT Serif](https://fonts.google.com/specimen/PT+Serif),
bundled locally via [Fontsource](https://fontsource.org/fonts/pt-serif).
Characters outside its coverage, including Chinese, fall back to system fonts.

Run backend checks from the repository root:

```bash
uv run pytest
```

Then, from `frontend/`:

```bash
npm run lint
npm run build
```

CI runs these checks on pushes and pull requests. Frontend behavior tests are
still to come; a passing build isn't browser-interaction coverage.

## Next

Build out Home, a dashboard view, and Settings in small steps, then bring the
layouts, controls, and motion into one consistent interface.

Category editing and Requirements movement stay on hold until that interaction
design is clearer. For now, the priority is keeping the card compact and usable,
not squeezing more controls into every pill.

After that: candidate profiles, job-search goals, and explainable matching.
Address selection, maps, application timelines, and a desktop release are
later work—not features already available.

Tracer helps you organize and review applications. It won't submit them for you.
