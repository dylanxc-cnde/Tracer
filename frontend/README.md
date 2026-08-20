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
- loading, API errors, parse status, candidate count, and the saved `card_key`
  are shown in the page.

The current interface is intentionally small. Full detail editing and a saved
card browser are not built yet.

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
```

FastAPI currently allows the local Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173` through CORS.

## Next steps

- browse and reopen saved cards in a Card library;
- open a saved Card, review its full details and source excerpts, then save
  user edits;
- manage aliases, notes, and tags on saved Cards;
- show Import History and connect each Import to the Cards created from it;
- improve the Card and Import layout, forms, and visual states;
- add frontend component and API tests;
- add the first Profile and matching screens after the Card workspace works;
- try desktop packaging after the browser workflow is useful on its own.

OpenAI keys and real application data stay in Python and never go into frontend
source code or `VITE_` environment variables.
