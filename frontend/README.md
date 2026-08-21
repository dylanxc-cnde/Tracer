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
- saved Cards can be permanently deleted after confirmation;
- Import History loads saved import requests and supports the same explicit
  deletion flow;
- loading, API errors, parse status, candidate count, and the saved `card_key`
  are shown in the page.

The current interface is intentionally small. Card and Import summaries can be
loaded and deleted, but full detail reopening and editing are not built yet.

## Source layout

```text
src/App.tsx                     current import, parse, select, and save flow
src/components/                 reusable React UI components
src/postings/types/             TypeScript versions of the API JSON contracts
src/postings/api/postings.ts    HTTP functions for posting routes
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
-> DELETE /posting-cards/{card_key}

GET /posting-imports
-> DELETE /posting-imports/{import_key}
```

FastAPI currently allows the local Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173` through CORS.

## Next steps

- reopen a saved Card and review its full details and source excerpts;
- add editing, aliases, notes, and tags after the update rules are settled;
- show which saved Cards came from each Import;
- improve the Card and Import layout, forms, and visual states;
- add frontend component and API tests;
- add the first Profile and matching screens after the Card workspace works;
- try desktop packaging after the browser workflow is useful on its own.

OpenAI keys and real application data stay in Python and never go into frontend
source code or `VITE_` environment variables.

Deleting an Import does not delete a saved Card. The Card keeps the old
`import_key`, so frontend code must treat the related Import as optional.
