# Tracer

[![CI](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/dylanxc-cnde/Tracer/actions/workflows/ci.yml)

**Turn messy job links and notes into cards you can actually review.**

Tracer is a small side project for sorting out internships, working-student roles, HiWi jobs, and thesis openings in Germany. I am also using it to learn more about Python, data modeling, and desktop app development.

Job pages and old application notes can be long and messy. Tracer lets you paste a public job URL or the text you already have, then uses a model to pull out useful details such as the company, role, location, requirements, deadline, and contact information.

```text
job URL or pasted text
-> AI retrieval and extraction
-> Evidence Card draft
-> validation and user review
-> user decides whether to apply
```

## A few rules

- Important values should include the supporting text or source URL.
- If the posting does not say something clearly, it stays `unknown`.
- Model output is a draft until the code validates it and the user reviews it.
- The system may find and prepare job cards, but only the user can create an application record.
- Tracer may help organize application materials, but it will not fill in or submit applications.

## What I am building first

The first version is one small Python flow:

```text
one public job URL or pasted description
-> create a Posting Import Request
-> call a model API with web search when needed
-> create and validate an Evidence Card draft
-> output JSON
```

Python and Pydantic own the data contracts and validation. A small TypeScript desktop interface can come later.

## Maybe later

- application status, emails, interviews, and next steps;
- CV, cover-letter, and portfolio versions;
- user skills, goals, and preferences;
- skill matching and application reviews;
- automatic job discovery.

None of that needs to be built all at once.

## Status

Very early. The repository currently contains the basic Python package structure, not a usable app.
# Tracer
