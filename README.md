# Tracer

**Turn job postings into cards that keep the original evidence close.**

Tracer is a small side project for sorting out internships, working-student roles, HiWi jobs, and thesis openings in Germany. I am also using it to learn more about Python, data modeling, and desktop app development.

Job pages can be long, messy, and gone a week later. Tracer saves what was there, then uses a model to pull out useful details such as the company, role, location, requirements, deadline, and contact information.

```text
job page
-> Source Snapshot
-> AI extraction
-> Evidence Card
-> user decides whether to apply
```

## A few rules

- Every confirmed value should point back to the original text.
- If the posting does not say something clearly, it stays `unknown`.
- Model output is a draft until the code validates it and the user reviews it.
- The system may find and prepare job cards, but only the user can create an application record.
- Tracer may help organize application materials, but it will not fill in or submit applications.

## What I am building first

The first version is just one small Python flow:

```text
one public job URL
-> save a Source Snapshot
-> extract readable text
-> call a model API
-> create and validate an Evidence Card
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
