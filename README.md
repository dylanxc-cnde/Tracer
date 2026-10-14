# Tracer

[![CI](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml)

**Turn messy job pages into job cards you can actually review.**

Tracer is a local-first job-search workspace, built with internships,
working-student roles, HiWi jobs, and thesis openings in Germany in mind.
Paste a posting, review what the AI picked out, and keep the useful parts
together—with sources, your corrections, tags, and notes.

Less digging through job pages. More time deciding which roles are worth a look.

## A look inside

These screenshots use a fictional posting and show an earlier layout and typography;
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
- Read, change, or clear your display name in Settings → Profile.

Quick Facts stays a read-only summary. Requirement categories are also read-only
for now; moving pills or groups and changing existing group rules are deferred.
Failed saves keep your draft, and editing never overwrites the initial snapshot.

The browser app currently has Home, Import Posting, Card Library, Activity,
Import History, and Settings. Profile loads the saved display name and saves
changes only when you select Save changes; Cancel restores the last saved name.
Leaving Profile discards unsaved edits. Job preferences, API settings, and
Activity remain placeholders. Home reads your saved display name for its greeting;
the remaining personal and Discover sections are layout prototypes. Its full-year
activity heatmap uses clearly labeled demo data, not recorded job-search activity.
It's not yet a packaged desktop app.

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
Card Library loads saved cards when you enter the page; use its refresh arrow to
reload them manually. In Import History, use the Load button to fetch saved records.

Analyze sends the posting input to OpenAI and uses paid API credits.
Saved records live in `.local/tracer.sqlite3`; older database schemas need a
manual, backed-up migration. Automatic upgrades aren't available yet.

## Development

The stack is React + TypeScript + Vite, FastAPI + Pydantic, and SQLite.
Parsing uses the OpenAI Responses API. A fictional parser example lives in
[examples/try_posting_parse.py](examples/try_posting_parse.py).

The interface uses [Inter](https://fonts.google.com/specimen/Inter),
bundled locally via [Fontsource](https://fontsource.org/fonts/inter).
Inter is by The Inter Project Authors and is licensed under the SIL Open Font
License 1.1. Its full copyright and license notice is retained in
[third-party licenses](frontend/public/third-party-licenses/inter.txt)
and included in the frontend build. Characters outside its coverage, including
Chinese, fall back to system sans-serif fonts. PT Serif remains installed for
possible future use, but is not loaded by the interface.

The app navigation, Home, and Settings use [Tabler Icons](https://tabler.io/icons/)
via `@tabler/icons-react` (MIT), with outline icons and the default stroke width of 2.
The full copyright and license notice is retained in
[third-party licenses](frontend/public/third-party-licenses/tabler-icons.txt)
and included in the frontend build. Framework7 Icons remains installed for
comparison, but these views no longer import it.

The Home activity heatmap uses
[React Activity Calendar](https://github.com/grubersjoe/react-activity-calendar)
(`react-activity-calendar`) by Jonathan Gruber, licensed under the MIT License.
Its font and colors are adapted to Tracer's interface. The full copyright and
license notice is retained in
[third-party licenses](frontend/public/third-party-licenses/react-activity-calendar.txt)
and included in the frontend build.

Run backend checks from the repository root:

```bash
uv run pytest
```

Then, from `frontend/`:

```bash
npm ci
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

CI is configured to run these checks on pushes and pull requests; this does not
prove that a particular commit's remote CI has passed. `npm run test:browser` runs
six Chromium tests: five real-App interactions with closed API/WebSocket mocks
and one bridge to the existing 16-case React component suite. The App cases cover:
failed provider creation preserves
the draft and displays a safe error; successful creation removes the dialog,
appends the server-returned provider without an extra GET, and reopens with an
empty masked key; invalid drafts (empty/whitespace-only name or key, negative
budget) show the exact validation message, focus the invalid field, retain all
four draft values and the saved list, and leave the dialog open and controls
enabled without a POST; a controlled pending POST checks the busy form/saving notice,
disabled fields and submit/Cancel/X, and native keyboard Escape leaving the dialog
open with its masked key, four-field draft and saved list intact. A POST-arrival
signal and explicit response gate synchronize this case without fixed sleeps;
releasing a fixed 500 failure restores controls and retains the draft, then editing
and cancelling works with only one POST; idle Cancel/X/native Escape close,
restore focus and discard the draft, with an empty password input on each reopen,
while a real backdrop click keeps the draft and dialog intact with zero POSTs.

The component bridge uses the suite's own fake fetch to cover loading/refresh
recovery, both platforms and empty/zero budgets, synchronous duplicate submission,
safe error categories, unknown-result refresh reconciliation and late callbacks
after unmount. Its fixed 16-result count and summary must be updated when the
component case list changes. Targeted isolated mutations detect removal of the
saving close guard (post-Escape dialog assertion) and synchronous submit guard
(`Duplicate submission` in the bridge error). The native idle case has no independent
mutation evidence. These checks do not prove every race. The 12 Node 24 request
tests run separately from the browser command; see the linked test instructions.

Non-finite budgets and native number-input `badInput`
are not automated. No fake key is displayed; an empty reopened input does not
prove secure memory erasure. A passing build alone is not browser-interaction
coverage. Real backend persistence and credential storage, HTTP cancellation,
all real navigation/late-response races,
external providers, other browsers, responsive and visual
acceptance remain outside these automated tests; see
[Settings tests](frontend/tests/README.md).

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
