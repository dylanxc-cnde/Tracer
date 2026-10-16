# Local Profile, Goal and match review

## Information hierarchy and real-content layout plan

This is the real-content plan for the Profile interaction repair within the
existing Settings page, not a separate demo product. The Home shell,
Inter, semantic colors and navigation remain unchanged.

- Settings → Profile keeps Display name in **User information** and directly
  loads **Background and skills** and **Job preferences**. There is no extra
  Open/Close workspace gate or repeated page title. Other pages and the API
  category do not mount these personal-domain readers.
- Both independent sections first show saved server content, not editable inputs.
  **Edit** opens that section's draft; an empty section offers a direct
  filling entry. Each has its own explicit confirmation, Save and Cancel. Save and
  Cancel stay adjacent; removing an entry is secondary. Profile has a two-field
  row (type/fact), Goal a three-field row (type/preference/priority). Narrow windows
  stack the fields without leaving an empty third column in Profile.
- Reading rows show type, full label, supporting details when supplied and Goal
  priority. Normal reading does not show UUIDs or revision numbers. Empty content
  explains what can be added; absent information stays unknown, never a failure.
  Recovery alone shows saved revisions for comparison. A failed load is an error
  with Try again, not an empty state or an invitation to overwrite unread data.
- Long-content reference: “Werkstudentin im Bereich datenbasierte Mobilitäts- und
  Infrastrukturplanung”, evidence “Python-Datenanalyse im universitären Projekt
  zur Auswertung kommunaler Verkehrsdaten”, and location constraint “Berlin und
  Potsdam, maximal zwei Präsenztage pro Woche während der Vorlesungszeit”. Labels
  and descriptions wrap; controls use a single-column fallback rather than
  truncating important text or using hover scrolling. These are layout examples,
  not saved user facts.
- Current Card reading mode offers **Review match**. Opening reads only; **Start
  local review** explicitly creates the assessment. The compact summary precedes
  expandable groups: advantages, evidence to add, explicit gaps and next steps.
  Each group shows the posting requirement, importance/AND/OR/unknown relationship,
  five-state text and confirmed evidence. One judgment editor is open at a time.
- No assessment is an empty state, not a positive match. Initial targets are
  unknown. Missing posting information stays unknown. Old input revisions are
  labelled **Needs re-evaluation** and remain readable, but cannot be corrected.
  Re-evaluation creates fresh targets, without silently importing old judgments.
- Profile load failures leave Try again available; Card review retains its Close.
  Save failures retain drafts.
  Unknown write outcomes lock further writes until a user-initiated read; the
  retained draft and saved state are compared before adopting saved data or
  explicitly starting a new confirmation. Leaving never claims to undo a request.

Browser behavior, responsive screenshots, keyboard/focus checks and user visual
acceptance for this new layout are pending the assigned tester/runner/reviewer.
The old Settings or Profile engineering checkpoints do not approve this repaired
page. The two requested viewports are 1440×1000 and 900×1000; first-entry images
must start at the real Profile entrance without scrolling to hide the page top.

## Save confirmed evidence and a goal

Open Settings → Profile (the default Settings category). Profile mounts the two
domain readers and reads `/profile` and `/goal`, while Display name uses its
existing, independent AppSettings request. Switching to API or another page
unmounts these readers; neither preloads personal data. A failed read is not
treated as an empty document.

Saved content is readable by default. Select **Edit** in the relevant section,
**Add background and skills** or **Set job preferences** for an empty
section. Editing one section does not remount the other or replace its draft.
Select its Save after explicit confirmation, or Cancel to return to reading mode.
Keyboard entry focuses the local editor heading; saving/cancelling returns focus
to its filling/Edit button. Escape no longer closes a nested workspace.

Profile evidence can be a qualification, skill, language, experience or
certificate. Enter a confirmed fact and optional description of its basis.
Use qualification for applicant eligibility, not a skill tag. Goal owns an
optional objective and constraints for work type, location, office arrangement,
hours, salary or availability, with required/preferred/unknown priority. Leave
unknown fields blank; an untouched section can be skipped. If you add a row,
provide a meaningful label or remove it rather than inventing a value.

Each section has a separate confirmation checkbox and Save. `PUT /profile` sends
only evidence and `expected_revision`; `PUT /goal` sends only objective,
constraints and its independent `expected_revision`. New rows send null entry
IDs; edits preserve server-issued IDs. Local React row keys are not persisted
as evidence identities. Confirming removals omits those entries from the new
current document; immutable saved revisions retain their old evidence.

The successful response updates only that form's saved baseline and revision,
then returns to reading the server-confirmed content. A never-recorded
document is `null`; explicitly saving an empty document records a revision but
does not create evidence of a gap. Cancel restores the last successfully read or
saved document with no request. Saving disables local controls and a synchronous
ref prevents duplicate writes before React's disabled state renders. The two
forms are independent, not a transaction with each other or AppSettings.

Ordinary rejected validation retains an editable draft. On conflict or an
unconfirmed write outcome, further writes are locked. **Read saved Profile/Goal**
preserves the retained draft and displays the saved version separately. Compare
facts, notes and revision, then explicitly **Use saved version** to discard the
retained draft and adopt server IDs before editing/confirming again. There is no
automatic retry or silent revision replacement. This prevents replaying a
creation whose response was lost. Read failures keep both the draft and lock.
Switching category or page discards component-local drafts and ignores late
domain responses; it does not cancel or roll back a request already sent. Re-entry
reads again. If an earlier write has not settled, use **Refresh saved background
and skills / job preferences** in reading mode before a
new confirmation; there is no cross-page pending-operation cache.

## Review a current Card locally

Open an already saved current Card in reading mode and choose **Review match**.
Only this explicit entry runs `GET /matching/card/{card_key}`. The original
read-only viewer and Card editing mode mount no match component, read no match
data and issue no match write. Existing Requirements editing and source/original
operations are unchanged. Switching into Card edit mode unmounts the review;
changed saved posting content also resets that UI intent, ignoring old responses.

**Start local review** explicitly posts `/evaluate` with the current fingerprint
returned by the read. This operation copies input snapshots and creates unknown
judgments, not an AI recommendation. With the same inputs, the existing review
is returned. Re-evaluating changed inputs creates a fresh match version and fresh
group/target/judgment identities; old judgments are never name-matched into it.

Expand Eligibility, Abilities or Preferences to see the exact target text,
posting source context, importance, AND/OR/unknown relationship, five-state
judgment and immutable linked evidence. Preference targets also show relevant
posting values alongside the user's confirmed Goal constraint. **Confirm or
correct** opens one local judgment draft. The user selects a status, writes a
reason and chooses valid evidence from the review's Profile/Goal snapshots.
Met/partial/missing need a reason and linked confirmed evidence. Not applicable
needs a reason; unknown may stay without evidence. Missing posting information
cannot be judged met/partial/missing. Qualification priority is explicitly
interpreted by the user from the posting text; choosing a required gate needs a
reason. Other priorities remain from the posting or Goal.

The explicit comparison checkbox and **Save judgment** send only one judgment,
its evidence references, expected input fingerprint and assessment revision.
They never upgrade a skill, rewrite a requirement, submit a job application or
send personal data outside the local backend. The form retains failed drafts,
guards synchronous duplicate writes, and ignores responses after close/unmount.
On unknown results/conflicts, **Read saved review** compares the persisted
judgment with the retained draft and locks writes until **Use saved review** is
explicitly chosen. Reading while a correction is open likewise requires this
comparison rather than silently advancing its write revision. Cancel sends no
write. Opening/closing the editor moves focus to its heading/back to its trigger;
closing the review returns to Review match. Browser verification remains pending.

## Interpret versions and results

The compact summary separates advantages, evidence to add, explicit gaps and
next steps. No total score, ranking or hiring probability exists. Met means
confirmed evidence satisfies the condition; partial is a confirmed but
insufficient degree of satisfaction; missing is confirmed non-satisfaction;
unknown means insufficient user/posting/logic information; not applicable needs
an explicit irrelevance reason. Unknown is neither missing nor met.

Deterministic aggregation excludes examples. ALL_OF requires every applicable
core item met; missing dominates and unknown otherwise remains unknown. ANY_OF
needs one met; all missing gives missing; remaining uncertainty stays unknown.
Unknown relationships do not guess a combined answer. Explicit not-applicable
core items are excluded. Required eligibility warnings cannot be overridden by
strong skills; preference conflicts are not a lack of applicant eligibility.
Evidence coverage displays record counts, not a quality score.

Approved regression cases (D05680601): M1 confirmed non-enrollment against a
required enrollment gate plus strong skills → eligibility missing and abilities
met; M2 no German B2 evidence → unknown, not missing; M3 Python/SQL ANY_OF with
confirmed Python project evidence → group met even if SQL is unknown; M4 skills
met but confirmed location/hours conflicts → preference missing, not applicant
ineligibility; M5 missing posting qualification/location or unknown requirement
relationship → unknown. A new review alone stays unknown; these conclusions
require explicit user judgments, not a mock automatic text comparison.

Match owns a canonical posting content hash, Profile/Goal revisions and rule
revision `local-review-v1`. Source context is part of that posting hash; alias,
notes and tags are not. This is content versioning, not a historical Card edit
counter. Reverting identical posting content gives the same posting hash.
**Inputs current at last read** is not a continuous freshness guarantee. Read
again/reopen after editing Profile/Goal or Card. Changed inputs label the saved
review **Needs re-evaluation**, show old snapshot revisions, and disable judgment
writes. Server CAS also rejects races with `409` rather than accepting an obsolete
comparison. Old evidence is resolved only from the saved review's snapshots, not
from newly edited/deleted current entries. The UI reads the latest assessment;
the API also retains immutable revisions via `/matching/card/{card_key}/history`, which lists the latest revision of each
assessment.

## Local data, first enable and failure recovery

All facts, constraints, notes and match revisions stay in the local SQLite
database. There is no external supplier or model call, browser persistent
storage, arbitrary URL fetch or credential lookup in this workflow. Text is
rendered as data, never instructions or executable markup. API errors display
fixed safe messages, not personal request bodies, database paths or raw errors.

New routers retain paths; GETs do not create the new tables. Only explicit valid
saves/evaluations create `personal_revisions` and `match_revisions`. Existing
startup behavior for old tables is unchanged. There is no ALTER, backfill,
Provider UUID regeneration or historical migration rerun. These facts do not
authorize running the new writes against a real user's old database.

Before first enabling writes in an old installation, obtain exact data-operation
approval, stop competing writers, record the path/version, and make a consistent
SQLite backup including committed WAL state. Verify integrity, readability and
restore capability on a separate temporary copy. On that copy compare old Card
current/original payloads, Imports, Settings and provider/credential-reference
identities before/after lazy-table creation. Do not export real API keys or treat
their secret values as a test fixture. The author has not performed this operation.

Backend transaction failures roll back that write; an HTTP/network error alone
does not prove it failed to commit. Read before retrying. For corrupt/unavailable
storage, stop writes, keep the error/evidence and diagnose on a temporary copy;
do not replace it with empty defaults. Restoring any real backup requires exact
separate approval. Disabling the new UI/routes is a reversible code rollback
without deleting saved revisions or modifying old facts.

## Evidence boundary at this source checkpoint

The prior implementation inspected routes `src/tracer/api/profiles.py` and
`matching.py`, DTOs in `profiles/models.py` and `matching/models.py`, and the local
service's fingerprints, reference checks and aggregation. This repair rechecks the
unchanged frontend DTO/request contract; the request layer uses one fetch attempt, validates consumed response
shape and never echoes server response bodies. Profile and Goal save feedback
and baseline revisions are independent. Personal domains mount with Settings
Profile; match review still mounts only at its explicit Card entry. Card
edit/original paths never mount the review.

This repair touches only four authorized UI/style files and the three existing
guides. It does not change request/types, backend, Card matching or API management.
The existing Settings checkpoint's results and visual approval remain historical.
Profile/Goal/Match checkpoint `beda68121a11b9e2619292b01b5a65efa699dba4` also
predates this repair; its engineering evidence does not verify the changed entry
and reading/editing flow or constitute user visual approval. No lint/build/type/browser/pytest/diff
check command has been run by this author under runner_protocol=1. The assigned
Claude test group, runner checks, screenshots and independent stage review are
next; no new test count, green result or user visual approval is prefilled here.

Closed browser mocks exercise actual UI behavior but do not establish browser
connectivity to real SQLite/backend. Temporary-database API tests establish only
their tested local API/persistence semantics and restart reconstruction, not
user-database migration, OS credentials or a supplier call. No real supplier
calls are authorized in this stage. New 1440×1000/900×1000 Home comparison and
long/empty/error/stale materials, direct user visual approval, whole-Beta final
double review and exact-final-HEAD Python 3.12/Frontend CI remain separate gates.
