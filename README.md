# Tracer

[![CI](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml)

**Turn messy job pages into structured records you can actually review.**

Tracer is a job-search workspace for internships, working-student roles, HiWi
jobs, and thesis openings in Germany. Paste a posting, check what the AI picked
out, and keep it in a local Card library—with the source text close by and
space for your own notes.

The idea is simple: spend less time digging through job pages and more time
figuring out which roles are worth a closer look.

```text
job URL or pasted text
-> AI retrieval and structured extraction
-> evidence, unknowns, and ambiguities
-> user selects a posting
-> confirmed Posting Card in SQLite
-> reopen, edit supported posting fields and personal notes, or view the original
```

## Current Card UI

Here's a look at the Card view: the job posting, broken into sections you can
scan and check. These screenshots use a fictional posting, with no real
employer or applicant data. Newer controls, including Show original and the
inline editors, aren't pictured yet. Click an image for a closer look.

| Overview and quick facts | Structured requirements |
| --- | --- |
| [![Posting Card overview](docs/images/card_overview.png)](docs/images/card_overview.png) | [![Posting Card requirements](docs/images/card_requirements.png)](docs/images/card_requirements.png) |
| Work conditions and compensation | Application details and My Card |
| [![Posting Card work conditions](docs/images/card_workconditions.png)](docs/images/card_workconditions.png) | [![Posting Card application details](docs/images/card_application.png)](docs/images/card_application.png) |

## What works now

- Pydantic models for imports, parsed posting details, and confirmed cards;
- local SQLite storage for posting imports and confirmed cards;
- an OpenAI Responses API parser with a shared prompt and strict structured output;
- a small FastAPI HTTP API for imports, parse results, and confirmed cards;
- a working React and TypeScript browser flow from pasted text to a saved card;
- local Card and Import libraries that reload records from SQLite;
- explicit, confirmed deletion for saved Cards and Import history;
- a Card Details dialog with quick facts, role content, requirements, job details,
  work conditions, compensation, application and contact details, company
  information, source excerpts, and creation metadata;
- a global Card edit mode with inline text, list, pill, date, choice, and
  compensation editors, sharing one draft and one Save/Cancel flow;
- an initial Card snapshot alongside the current saved version, with a
  read-only Show original action in Card Library;
- disabled editing controls while saving, with the draft retained if saving
  fails and save errors shown over the Card rather than above the scroll area;
- a responsive three-page application shell with class-based component styles;
- selectable posting candidates with loading, error, and confirmation states;
- section-level source excerpts and URLs, with a Modified by user notice when
  a saved section differs from the original;
- multiple posting candidates without mixing in recommended jobs;
- compact requirement pills grouped by importance and displayed in
  `all_of -> any_of -> unknown` order, with examples on a separate row;
- explicit ambiguities when a value cannot be classified safely.

The AI gives you a starting point, not the final word. Missing information
stays unknown, and you review and select a posting before saving it as a Card.

### Editable today

| Section | Editable content |
| --- | --- |
| What you'll do | Role summary, responsibilities, and role-domain pills |
| What they're looking for | Add/remove importance sections; add All required together or Choose any one groups; add, edit, delete, and switch pills between requirements and examples |
| Job details | Workload, job types, contract type, seniority, work modes, primary address, other address candidates, internship requirement, and eligibility |
| Work conditions | Weekly hours, schedule, travel requirement, start date, and duration; add missing fields or remove existing ones |
| Salary and benefits | Repeatable compensation entries, amounts, currency, period, pay basis, applicable groups, payment conditions, benefits, and vacation days |
| Application | Channels, application URL, deadline, email subject, required documents, and special instructions |
| Contact | Name, role, email, and phone |
| About the company | Company summary, industries, and company size |
| My Card | Alias, tags, and notes |

Requirements now has its basic editor, using the same Card-wide draft and
Save/Cancel flow. New pills start as regular requirements and can be switched
to examples. Each importance section allows one All required together group
and multiple Choose any one groups; existing unknown-rule groups remain separate.
Saving drops blank items and empty groups, and checks changed groups for enough
non-example requirements. Moving pills between groups, changing group rules,
and drag-and-drop are not part of this iteration.

This is the editable Card MVP checkpoint, not a finished interface or a promise
that every field is editable. Identity and Posting info are still read-only.
Quick Facts remains a display-only summary of the saved Card: supported edits to
classification, primary address, work modes, hours, deadline, and salary appear there
after saving, not while typing in the draft.

Job classification separates role category, full-time/part-time workload,
seniority, and contract type. The Job details section, between Requirements
and Work conditions, shows these fields alongside eligibility, work mode,
and addresses. Each Card keeps one preferred address string and a list of
alternatives, without separate city/region/country fields to keep in sync.
Preferred means first choice for display and future map lookup, not verified.
Quick Facts uses a shortened preview; Job details keeps the full text.
Eligibility is one text for education, fields of study, enrollment and other
applicant conditions. Requirements focuses on capabilities, experience, languages
and professional credentials instead of repeating those eligibility conditions.
Job details edits use the same Card Save/Cancel; job types and work modes allow
multiple selections. Each alternative address has its own editable box, with
add and delete controls in edit mode. Choosing a primary address directly from the candidate list
and confirming addresses are still to come. Deadline stays under Application
and in the read-only Quick Facts summary, not in Job details.

Card storage keeps two full JSON payloads in the same row: the initial saved
Card and the current version. Save submits the supported editable fields;
FastAPI/Pydantic validates them, and the backend replaces the current payload
while preserving source excerpts, their URLs, and system metadata. The initial
snapshot stays untouched. Changed facts are marked as user-defined; restoring
their original values also restores their original provenance.

The initial snapshot is not a web-page archive or a history of every edit, and
deleting a Card removes both versions. For older records backfilled into this
layout, the original snapshot starts at migration time, not before.

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

CI runs Python tests, frontend lint, and the TypeScript/Vite build on pushes
and pull requests. Frontend component and API behavior tests are not yet set
up; a passing build does not cover browser interactions.

## Run the local app

Start FastAPI from the repository root:

```bash
uv run --env-file .env.local fastapi dev src/tracer/api/app.py
```

Then start the frontend in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Paste a posting, analyze it, select one candidate,
and confirm it to create a saved Posting Card. Open
`http://127.0.0.1:8000/docs` to inspect the API directly.

In Card Library, select Load card library, then View details to review or edit
the current Card. Show original opens its initial snapshot without edit
controls. Import History has its own Load button. Automatic page-entry refresh
and preservation of Library/History page state are still pending.

The posting routes are:

```text
POST /posting-imports
GET  /posting-imports
GET  /posting-imports/{import_key}
DELETE /posting-imports/{import_key}
POST /posting-imports/{import_key}/parse-results
POST /posting-cards
GET  /posting-cards
GET  /posting-cards/{card_key}
GET  /posting-cards/{card_key}/original
PATCH /posting-cards/{card_key}
DELETE /posting-cards/{card_key}
```

The local database is created at `.local/tracer.sqlite3`. Calling Analyze
requires an OpenAI API key and uses paid API credits. If the key is already
exported in the shell, the `--env-file .env.local` option is not needed.

An existing database from an older schema is not automatically migrated by
app startup. Back it up before any manual migration; the project does not yet
provide a supported upgrade or recovery workflow.

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

The next focus is the workspace as a whole: build out Home, the dashboard view,
and Settings in small steps, with clear navigation and useful basic flows.
Their exact scope—and whether Home and the dashboard need separate pages—will
be settled as each area is added. These pages are planned, not available yet.

Once the main pieces are in place, bring their layouts, controls, and motion
into one consistent interface language, including revisiting Card Details.
The current layout is a working baseline, not a design we have to keep forever;
basic usability and reliable saving still matter along the way.

Remaining Card work stays on the roadmap, without making every field editor
a prerequisite for building the wider workspace:

- pause Requirements at basic editing for now. Revisit cross-group moves and
  group-rule changes when actual use calls for them; drag-and-drop is not an
  MVP requirement;
- add editing to the existing Identity/Posting info area separately, without
  duplicating the metadata already shown in the header;
- add address review and selection before presenting a map destination as
  confirmed; keep city-level locations explicitly approximate and never
  substitute company headquarters for a work location. Coordinates, geocoding,
  caching, and commute estimates remain separate, later work;
- design a stable tag catalog and selection UI only when filtering and matching
  need more than the current string tags;
- show the relationship between an Import and the Cards created from it;
- refine the existing editing layout and error feedback without turning Card
  Details into a generic JSON form.

The editing UI is still an early version. Page refresh behavior and overlapping
request handling, along with frontend behavior tests, are deferred until the
relevant interactions are refined; automatic refresh alone will not prevent an
old response from replacing newer UI state.

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
