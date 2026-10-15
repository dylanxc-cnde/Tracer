# Home shared records

This is the local personal Home capability authorized by D06397dc9 inside
T8e151f4c. Discover, Recommended jobs, Market brief and Ask Tracer are outside
this implementation. No external AI, credentials, new dependencies or real-user
database writes are needed to use or test these records.

## Ownership and persistence

- `Task` owns a user-entered title, optional due date and current completion time.
  Dates (`due_on`, `applied_on`) are date facts, not midnight UTC timestamps.
- `ScheduleEvent` owns a user-recorded interview, deadline or other event and
  its adjustment/cancellation. A Card reference does not change the Card.
- `ApplicationRecord` owns the explicitly recorded application's current status.
  There is at most one record per Card. Saving/interested/recommended is not
  applying. `ApplicationEvent` appends the initial and subsequent status facts.
- `ActivityEvent` owns an observed workspace operation, not private text.
  It contains only event ID, kind, UTC occurrence time, stable subject key and
  optional Card ID. Titles, notes, evidence and source text are not copied here.
- Card/current/original payloads, Profile/Goal revisions, Settings, Provider IDs
  and credential associations retain their existing owners and contracts.

New tables are `home_tasks`, `home_events`, `home_applications`,
`home_application_events` and `home_activity_events`. Construction and Home
reads do not create them. The first explicit Home write or successful Card
write's activity hook uses `CREATE TABLE IF NOT EXISTS` inside a transaction.
This only appends tables; it neither migrates nor alters old tables. Existing
legacy Card/Settings stores still initialize their own tables at app startup.
`SettingsStore.get()` is the public budget read; the already initialized store
is supplied at router registration, so overview reads perform no Settings DDL,
write, credential access or connection verification.

Home writes take `BEGIN IMMEDIATE`. Primary facts, application history and
corresponding activity commit or roll back together. Task creation/reopening
is not an activity kind; only completion counts. The completion subject key
is the task UUID itself: reopening and completing again updates the
current completion timestamp but never adds a second heatmap operation.
Other subject keys are namespaced by kind to prevent cross-entity collisions.
Creation activity uses the entity ID; each substantive event/status adjustment
has a fresh operation ID. Activity insertion uses `INSERT OR IGNORE` with a
unique subject key. No-op PATCHes leave timestamps/history/activity unchanged.

The Card hook runs **after** the existing Card write commits. Creation records
`card_saved`; PATCH records `card_updated` only when returned current content
differs from the pre-write saved Card. A SQLite activity error is ignored without
logging input or affecting the successful Card response. This best-effort gap
is intentional: a successful Card write can lack activity if storage fails.
It never creates an application. Deleting a Card has no Home cascade; application
and activity history survive and overview marks missing references explicitly.

## HTTP contract

All new request models forbid extra fields. Titles are nonblank and at most 200
characters. UUIDs for creation are supplied by the client; keep the same UUID and
creation payload when reconciling a lost response. Exact normalized creation
replay returns the stored **current** record, even if subsequently adjusted.
Reusing the UUID with different creation content returns 409. Replay compares
the immutable creation request, not the current mutable record. Creation returns
201, including replay. Do not automatically resend an uncertain write.

| Method and path | Request / result |
| --- | --- |
| POST `/home/tasks` | `{task_id, title, due_on?}` → Task including `created_at`, nullable `completed_at` |
| POST `/home/tasks/{task_id}/complete` | No body; returns current Task, repeated completion is a no-op |
| POST `/home/tasks/{task_id}/reopen` | No body; clears current completion, retains historical activity |
| POST `/home/events` | `{event_id, kind, title, starts_at, ends_at?, card_key?, cancelled?}` → ScheduleEvent with `created_at` |
| PATCH `/home/events/{event_id}` | Only supplied fields change; `ends_at` and `card_key` may be cleared with null |
| POST `/home/applications` | `{application_id, card_key, applied_on, status?}` → ApplicationRecord with `created_at`, `updated_at` |
| PATCH `/home/applications/{application_id}` | `{status}` → current ApplicationRecord |
| GET `/home/activity?from=...&to=...` | `{events: ActivityEvent[], recording_started_at: timestamp|null}` |
| GET `/home/overview?today=...&day_start=...&day_end=...&upcoming_end=...&interviews_end=...` | Projection below |

Event kinds: `interview`, `deadline`, `other`. Application statuses: `applied`
(default), `interviewing`, `offer`, `rejected`, `withdrawn`. Timestamps require a
timezone and are normalized to UTC; end cannot precede start. A new Card reference
must exist. Existing references to deleted Cards can remain on adjusted records.

Home errors return only fixed `detail`, without request text or raw exceptions:

- 422 `home.invalid_request` (including body, UUID, date/window validation)
- 409 `home.id_conflict`, `home.application_exists`
- 404 `home.not_found`, `home.card_not_found`
- 503 `home.storage_unavailable` (SQLite or invalid stored payload)

## Overview and count definitions

The client supplies its local `today` (YYYY-MM-DD) and aware timestamp windows.
Use local midnight converted to UTC for `day_start`/`day_end`, the start of the
14th following local day for `upcoming_end`, and the start of the 7th following
local day for `interviews_end`. Server validation requires ordered windows but
does not infer/store a timezone. All timestamp intervals are half-open `[start,
end)`; daylight-saving days need not be 24 hours. Due-date Upcoming uses the
14 date facts `[today, today + 14 days)` independently of UTC offset.

- `today.tasks`: incomplete tasks due today or overdue, plus undated tasks.
  Future-dated tasks do not appear here. `completed_tasks` and `completed_count`
  use current `completed_at` in today's timestamp window. Reopened tasks are
  no longer currently completed, but their historical activity remains.
- `today.events`: noncancelled events starting today, each `{event, card_missing}`.
- `upcoming.events`: noncancelled events starting in the supplied 14-day window,
  each `{event, card_missing}`. `upcoming.tasks`: incomplete due-date tasks in
  the 14-date window. Card source deadlines are not silently imported as events.
- `your_search.active`: applications in `applied` or `interviewing`.
  `awaiting_reply`: exactly `applied`. `interviews`: noncancelled interview
  events starting in the supplied seven-day window, not AI guesses or an
  inferred application count.
- `applications`: newest-first `{record, card_missing}` for the application
  management view, including references to deleted Cards.
- `recent_jobs`: at most five live saved Cards, newest creation first, each
  `{card, application}`; `application` is null unless explicitly recorded.
- `recent_activity`: at most ten newest `{event, card_missing}` operations.
  Missing Cards should be presented as “Job deleted”, not silently dropped.
- `ai_usage`: `status: "not_recorded"`, `tokens: null`,
  `estimated_cost_usd: null`. `providers` contains public provider identity/name
  and `monthly_budget_usd`. `budget_status` distinguishes `not_set` (null),
  `zero` (0), and `set` (positive value). No providers is an empty list, not
  invented zero usage. Budgets are preferences, not enforced runtime caps.

Home facts and live Cards are read in one SQLite snapshot. The separate public
Settings read is configuration, not a claim of atomic usage accounting.

## Activity and heatmap semantics

Count each returned ActivityEvent once, bucketed by the frontend's device-local
date, never by AI calls or reads. Kinds are `card_saved`, `card_updated`,
`task_completed`, `application_recorded`, `application_status_changed`,
`event_recorded`, `event_adjusted`. Counts are **recorded workspace operations**,
not numbers of applications, productivity scores or fabricated past progress.

`recording_started_at` is the first ActivityEvent across all dates, not just the
queried interval, or null when none exist. Before that time, show “Not recorded”
rather than zero. With no events, do not invent a recording start date. Do not
backfill activity from old Card timestamps. Zero after recording began means
no recorded operations for that bucket; it cannot prove no real-world activity.
Distinguish empty data, unknown/unrecorded data and an unsuccessful load.

## Real-database activation: plan only, not executed

Enabling the UI is not permission to write new tables in a real user's database.
Before the **first explicit write**, obtain approval for the exact database and
backup/validation plan. Stop the app and any writers; make a consistent SQLite
backup using SQLite's backup facility (or a verified stopped-database copy that
also handles WAL state). Keep it private with the original permissions. Record
the snapshot time and backup location without publishing private payloads.

On an isolated copy, run integrity checks, capture old schema and row counts,
and confirm existing Card current/original data, Provider UUIDs and credential
references are unchanged. First verify Home reads add no tables. Perform an
explicit synthetic write in a **temporary test database**, verify the five
append-only-schema additions, restart `create_app` and re-read records. Verify
no duplicate completion/activity and no application from a Card save. Do not
open the real credential store in these tests. Only after successful validation
and explicit activation authorization should the real application perform its
first write. Do not run historical migrations or replay synthetic fixtures
against the real database.

If activation fails, stop further writes and preserve the failure evidence.
Disable the new Home entry points; do not delete confirmed facts to “roll back”.
Restore a verified backup only with separate explicit authorization: restoration
can discard changes made since the backup. Never regenerate Provider UUIDs or
copy secret values into reports.

## Verification status

Backend source inspection only at this checkpoint. The assigned tester will
write the Home behavior group; the deterministic runner must execute it and the
existing pytest regression suite plus diff checks. No new execution result,
temporary-database persistence result, frontend integration, real-user database
activation, external-provider call or visual approval is claimed here.
