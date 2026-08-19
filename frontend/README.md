# Tracer frontend

This is the small React interface for Tracer. I am building it in the browser
first, then reusing the same UI when the project gets a desktop wrapper.

The frontend handles input, loading states, review, editing, and confirmation.
Python still handles AI calls, validation, SQLite, and card creation.

## What works now

- React, TypeScript, Vite, and Oxlint are set up;
- job posting text can be entered;
- the current character count updates while typing.

The Analyze button does not call FastAPI yet.

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

FastAPI runs separately. From the repository root, start it in another
terminal:

```bash
uv run fastapi dev src/tracer/api/app.py
```

Open `http://127.0.0.1:8000/docs` to try the API. The frontend will connect to
it through HTTP and JSON once the first review screen is ready.

## Next steps

- show sample parse results as selectable job cards;
- add posting details and source review;
- connect Analyze and Confirm to FastAPI;
- handle loading, missing information, and errors;
- add desktop packaging after the local browser flow works.

OpenAI keys and real application data stay in Python and never go into frontend
source code or `VITE_` environment variables.
