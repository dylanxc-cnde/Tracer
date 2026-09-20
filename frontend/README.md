# Tracer frontend

This is where you paste postings, look through the results, and manage your
Card library. It's built with React, TypeScript, and Vite. The UI runs in the
browser today, with plans to reuse it in a desktop app later.

The frontend handles input, loading states, candidate review, selection,
confirmation, and Card editing. Python handles AI calls, validation, SQLite,
and Card creation and updates.

## What works now

- a posting input with a live character count;
- TypeScript contracts cover posting imports, parsed results, and cards;
- Analyze creates an import and asks FastAPI to parse it;
- parsed candidates are shown as selectable cards;
- every candidate needs an explicit user selection, even when there is only one;
- Confirm sends the selected posting back to FastAPI and saves a Posting Card;
- a Load button retrieves saved Cards and renders them through `CardLibrary`
  and `PostingCardSummary`;
- saved Cards reopen in a details dialog with a sticky title bar, quick facts,
  requirements, compensation, source excerpts, and company details;
- the global Card edit mode updates supported posting fields and My Card
  through one draft and Save/Cancel flow;
- inline text, repeated-list, pill, date, choice, and compensation editors
  support the existing body sections outside Requirements;
- saving temporarily disables editing controls; a failed save keeps the draft
  available for correction or retry and displays an error over the Card;
- Show sources reveals section-level evidence and a Modified by user notice
  for saved sections that differ from the original;
- Show original in Card Library fetches the initial saved Card and opens it
  in the same Details component without edit controls;
- Requirements have their own display component: importance sections contain
  `all_of`, then separate `any_of`, then separate `unknown` groups, with examples
  below the core pills;
- saved Cards can be permanently deleted after confirmation;
- Import History loads saved import requests and supports the same explicit
  deletion flow;
- the three main pages share a responsive sidebar, semantic colors, named
  component classes, and primary/danger button states;
- loading, API errors, parse status, candidate count, and saved Card summaries
  are shown in the page.

You can bring a posting in, save it, come back to it, and edit its role content,
work conditions, compensation, application details, contact, company details,
and personal fields. See [Editable today](../README.md#editable-today) for the
exact scope. Requirements is the next major editor. Identity and Posting info,
locations, work modes, and job classification also remain read-only.

Quick Facts is a read-only projection of the saved posting, not a separate
draft: changes to editable hours, deadline, and salary appear there after a
successful save.

The original Card is its initial saved snapshot, not the latest version or a
full edit history. It uses the same `PostingCard` response type. The Show
original action is currently wired only in Card Library, not on the Import
page's newly created Card summary.

## Source layout

```text
src/App.tsx                              application shell and page switching
src/pages/                               page-level state and API actions
src/components/posting-import/           Import-only components
src/components/import-history/           Import History components
src/components/card-library/             Card Library components
src/components/posting-card/             shared Card components
src/components/posting-card/details/     Card Details and its editor hook
src/postings/context/                    shared Import session and domain actions
src/postings/types/                      TypeScript API JSON contracts
src/postings/api/postings.ts             HTTP functions for posting routes
```

React components use these functions instead of writing HTTP requests directly.

The Import session stays in its Provider across page switches. Library and
History lists and open dialogs remain page-owned: those pages currently unmount
when hidden, and their lists must be loaded again. Each Details instance owns
its own editor draft; sharing a Hook definition does not share its state.

Section components receive their draft values and callbacks from Card Details.
The editor Hook owns changes and validation, normalizes the draft into an update
request, and passes it to the page's save action. Cancel discards the draft;
successful saving updates the page's Card state from the API response.

## Run it

Use Node.js 24 or another version supported by Vite.

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite updates the page when the source changes.

## Useful commands

```bash
npm run dev      # start the Vite development server
npm run build    # type-check and create a production build
npm run lint     # check the source with Oxlint
npm run preview  # preview the production build locally
```

CI already runs `npm ci`, `npm run lint`, and `npm run build` on pushes and
pull requests, using Node.js 22. There is no frontend test runner or component/
API behavior suite yet; adding those tests is deferred, not part of this step.

## Backend

FastAPI runs separately. From the repository root, start it in another terminal:

```bash
uv run --env-file .env.local fastapi dev src/tracer/api/app.py
```

Open `http://127.0.0.1:8000/docs` to try the API directly. Import and confirmation
use this sequence:

```text
POST /posting-imports
-> POST /posting-imports/{import_key}/parse-results
-> user selects one candidate
-> POST /posting-cards
```

Saved-record actions are independent, not one mandatory sequence:

```text
Load cards       GET    /posting-cards
Show original    GET    /posting-cards/{card_key}/original
Save card edits  PATCH  /posting-cards/{card_key}
Delete card      DELETE /posting-cards/{card_key}
Load imports     GET    /posting-imports
Delete import    DELETE /posting-imports/{import_key}
```

View details currently uses the Card already loaded in the list or returned by
creation. Show original makes a separate request. A successful PATCH returns
the updated Card, which the page uses to update its UI state without another GET.

FastAPI currently allows the local Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173` through CORS.

## Next steps

- review and merge the existing inline editors, then work on Requirements in
  a separate branch, one small change at a time;
- build on the existing Requirements display and ordering: agree on the draft
  and update contract before connecting editing; preserve the distinction
  between importance and group rules, with separate `any_of`/`unknown` groups;
- reuse the existing Card-wide draft, validation, Save/Cancel, and error flow;
  keep component moves separate from editing behavior and leave drag-and-drop
  until group editing works;
- keep Quick Facts as a read-only summary and scope the remaining identity,
  location, work-mode, and classification editors separately;
- refine reading/editing geometry using the existing inline editor patterns;
- keep the existing 960px maximum Details width; refine it and add the section
  navigation rail only when its interactions and stable section IDs are defined;
- show which saved Cards came from each Import;
- revisit page-entry refresh, page-state retention, overlapping requests, and
  frontend component/API tests when refining those interactions; these are
  deferred rather than immediate prerequisites;
- add the first Profile and matching screens after the Card workspace works;
- try desktop packaging after the browser workflow is useful on its own.

OpenAI keys stay on the Python side and never go into frontend source code or
`VITE_` environment variables. The UI receives posting data through the API;
real application records must not be committed as source or test fixtures.

Deleting an Import does not delete a saved Card. The Card keeps the old
`import_key`, so frontend code must treat the related Import as optional.
