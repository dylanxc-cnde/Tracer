# Local search and Agent

## Local search

### Interaction and implementation boundary

Before this change, the global top bar is a non-interactive search placeholder.
The intended flow is: focus the search field (or Ctrl/Cmd K), enter local text,
review typed results with their source, and open a saved job or Home record.
Loading, no matches and failure are separate states. Escape dismisses results
and returns focus to the search field. Long job and company names wrap rather
than being replaced with abbreviated placeholder content.

The backend search service owns a read-only projection of current Card and Home
facts. The search router owns HTTP validation and safe error messages. Frontend
`search/api` owns requests and response validation; `GlobalSearch` owns the
debounced input and result selection. A separate result viewer owns the selected
record's read lifecycle, reusing the existing Card details dialog for jobs.
`App` only replaces the top-bar placeholder and supplies page navigation.

Provider configuration, Profile, Goal, matching rules, Home writes, persistence
identities and confirmation semantics remain unchanged. Search does not create
activity, call a model, access credentials, or use external search. No dependency
or database migration is needed. Agent tools and external retrieval are not
implemented by this search unit.

### HTTP and local data

`GET /search?q=<text>&limit=20` returns `{results, has_more}`. The query must
contain 1–200 non-blank characters; `limit` is 1–50 (default 20). Each result has:

- `type`: `job`, `company`, `note`, `task`, `event` or `application`;
- `source`: `Card library` or `Home`;
- `title` and a plain-text `snippet` of at most 220 content characters plus
  truncation marks;
- `target: {kind, id}`: `card` with a Card UUID, or `task`, `event`,
  `application` with its Home record UUID;
- `card_missing`: a retained Home reference points to a deleted job. This never
  recreates a Card or removes the Home record.

The current saved Card payload, not its original snapshot or stale indexed
projection, supplies job title/alias, company and user notes. Company and note
results open their owning Card; there is no separate Company or Note entity.
One company may therefore appear once per saved job. Task titles, due dates and
completion status, event titles/kind/time/cancellation, and application job
title/company/date/status are searchable. These records are not restricted to
today's overview window. Provider, Profile/Goal, imports, original snapshots,
source excerpts, credentials and activity logs are not searched.

Matching is a literal case-folded substring, including German case folding; `%`,
`_`, quotes and SQL-looking strings are text, not wildcards or commands. Results
have a stable type/title/ID order, not an AI ranking or relevance score. A bounded
extra row detects more matches without returning the whole corpus. The initial
implementation scans permitted fields in local SQLite; it does not introduce a
search index, FTS extension or duplicated stored facts.

`GET /search/records/{kind}/{id}` reads a specific Home record independently of
the current date window. It returns `{type, id, title, source, fields, card_key,
card_missing}`, where `fields` is a list of `{label, value}` display facts.
This read-only dialog shows the saved task, event or application and can open a
live linked Card or navigate to Home. It is not an editor. Job/company/note
targets use the existing `GET /posting/card/{id}` and existing read-only Card
details dialog; normal editing remains in Card library.

The search service connects with SQLite `mode=ro`, discovers only existing
tables, and reads one transaction snapshot. Missing database/tables produce
empty results (record opening returns 404); reads never create them. Queries and
IDs are bound parameters; table names and JSON paths are fixed code. Registration
does not instantiate a writing store. No `ActivityEvent` is emitted. Validation
errors are fixed 422 messages; missing records are 404; malformed stored data or
SQLite failure is a fixed 503. Neither raw errors nor query text are echoed in
these error responses. As with other local HTTP reads, query parameters can be
visible to a server's access logger; no new logging is added here.

### Request lifetime and accessibility

No search request is made on application load, navigation, or focusing an empty
field. Non-empty user input is debounced by 250 ms. Editing immediately removes
old results; request generations and AbortController prevent older responses
from replacing newer results. Escape, blur/outside click and unmount dismiss or
invalidate pending reads. Retry is explicit and only repeats a read. No local
or session storage, polling, analytics, model invocation or external request is
introduced. Opening a result reads it afresh; failure does not masquerade as an
empty record and has a manual retry/close action.

The top-bar field is a labelled combobox with a listbox and active descendant.
Arrow keys move through results; Enter opens the selected result; Escape closes
the panel or record dialog. Tab can leave the panel without trapping focus.
Ctrl/Cmd K focuses search except while a modal is open. Closing a result returns
focus to the persistent search field; linked-job viewing returns to the Home
record and its Open linked job button first. Focus restoration does not reopen
the search panel or repeat the search. The popover and detail dialog use existing theme variables and
bounded independent scrolling; long titles, company names and snippets wrap.

### Verification boundary

Source inspection is not behavioral or visual approval. The current stage's
tester/runner must verify six result types, read-only behavior and missing job
references, no initial search calls, debounce/stale responses, opening results,
empty/error/retry states, keyboard/focus, and the existing closed mocks and
regressions. Minimum visual evidence is a real initial entry and long-result
panel at 1440×1000 and 900×1000, plus a representative opened record and empty or
error state; screenshots use isolated synthetic data. No real user database,
credentials or paid service is needed. Tests, screenshots and independent
review remain pending at this source checkpoint.
