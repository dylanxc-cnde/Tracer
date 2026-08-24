# Tracer frontend

This is the small React interface for Tracer. I am building it in the browser
first, then reusing the same UI when the project gets a desktop wrapper.

The frontend handles input, loading states, candidate review, selection, and
confirmation.
Python still handles AI calls, validation, SQLite, and card creation.

## What works now

- React, TypeScript, Vite, and Oxlint are set up;
- job posting text can be entered;
- the current character count updates while typing;
- TypeScript contracts cover posting imports, parsed results, and cards;
- Analyze creates an import and asks FastAPI to parse it;
- parsed candidates are shown as selectable cards;
- every candidate needs an explicit user selection, even when there is only one;
- Confirm sends the selected posting back to FastAPI and saves a Posting Card;
- a Load button retrieves saved Cards and renders them through `CardLibrary`
  and `PostingCardSummary`;
- saved Cards reopen in a details dialog with a sticky title bar, quick facts,
  requirements, compensation, source excerpts, and company details;
- the global Card edit mode updates alias, string tags, and notes through one
  draft and Save action;
- saved Cards can be permanently deleted after confirmation;
- Import History loads saved import requests and supports the same explicit
  deletion flow;
- the three main pages share a responsive sidebar, semantic colors, named
  component classes, and primary/danger button states;
- loading, API errors, parse status, candidate count, and the saved `card_key`
  are shown in the page.

The current interface is intentionally small. Card and Import records can be
loaded and deleted, saved Cards can be reviewed in detail, and the user-owned
Card area can be updated. Structured posting facts are still read-only.

## Source layout

```text
src/App.tsx                              application shell and page switching
src/pages/                               page-level state and API actions
src/components/posting-import/           Import-only components
src/components/import-history/           Import History components
src/components/card-library/             Card Library components
src/components/posting-card/             shared Card components
src/components/posting-card/details/     Card Details and its editor hook
src/postings/types/                      TypeScript API JSON contracts
src/postings/api/postings.ts             HTTP functions for posting routes
```

React components use these functions instead of writing HTTP requests directly.

## Run it

Use Node.js 24 or another version supported by Vite.

```bash
cd frontend
npm install
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

## Backend

FastAPI runs separately. From the repository root, start it in another terminal:

```bash
uv run --env-file .env.local fastapi dev src/tracer/api/app.py
```

Open `http://127.0.0.1:8000/docs` to try the API directly. The browser uses this
sequence:

```text
POST /posting-imports
-> POST /posting-imports/{import_key}/parse-results
-> user selects one candidate
-> POST /posting-cards
-> GET /posting-cards
-> PATCH /posting-cards/{card_key}
-> DELETE /posting-cards/{card_key}

GET /posting-imports
-> DELETE /posting-imports/{import_key}
```

FastAPI currently allows the local Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173` through CORS.

## Next steps

- extend Card editing one field shape and one business section at a time;
- extract each section only when its display and editing behavior is stable,
  rather than splitting the entire Details component in advance;
- prototype an inline text editor whose reading and editing geometry stays
  visually stable, then reuse that proven pattern;
- keep Quick Facts and header summaries read-only and derive them from the
  current edit draft;
- add section-level controls for missing supported fields without opening a
  second modal dialog;
- show a subtle signal only for unsaved changes and keep saved content visually
  quiet;
- leave Requirements until the simpler scalar, repeated-text, pill, enum, date,
  and compensation editors have established the shared patterns;
- add the wider Details layout and section navigation rail only after section
  boundaries and stable section IDs exist;
- show which saved Cards came from each Import;
- add validation and storage error states without losing the unsaved form;
- add frontend component and API tests;
- add the first Profile and matching screens after the Card workspace works;
- try desktop packaging after the browser workflow is useful on its own.

OpenAI keys and real application data stay in Python and never go into frontend
source code or `VITE_` environment variables.

Deleting an Import does not delete a saved Card. The Card keeps the old
`import_key`, so frontend code must treat the related Import as optional.
