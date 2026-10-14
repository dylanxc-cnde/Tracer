# Settings: fields, ownership, and behavior

Settings exposes local user preferences and the AI configuration currently
consumed by Tracer. The descriptions below distinguish saved configuration from
runtime guarantees: a saved value is not proof that a provider accepts a key,
supports a model, or has billed a particular amount.

## Profile

| Setting | User flow and purpose | Save, read, and effect | Limits and recovery |
| --- | --- | --- | --- |
| Display name | Settings → Profile lets the user edit, clear, or cancel the greeting name. It is the existing personal preference used by Home, not a CandidateProfile or job-search fact. | `PATCH /settings/user` saves `user.display_name` in the single local `app_settings` SQLite JSON snapshot. Profile loads it with `GET /settings`; Home independently reads that saved value when Home mounts and uses it for the greeting. Empty input is saved as `null`. | Failed save retains the local draft; retry is user initiated. Leaving Profile discards an unsaved draft. Home re-entry reads settings again; there is no global Settings cache or cross-page pending-save synchronization. A save already sent is not cancelled by navigation. |

**Open Profile and Goal** explicitly mounts the new local personal workspace.
Only then does it read `GET /profile` and `GET /goal`. Confirmed candidate evidence
and job-search constraints have separate forms, confirmations, PUT endpoints,
saved revisions and feedback. They do not modify AppSettings, the greeting or
credentials. Empty optional data stays unknown. Match review is an explicit
operation in a saved current Card's reading mode, not a background AI call.
See [Local Profile, Goal and match review](profile-matching.md) for operation,
version invalidation, response-loss reconciliation and first-enable backup rules.
This new integration has source inspection only at this checkpoint; the old
Settings evidence below does not establish that it works or approve its visuals.

## API providers

Settings → API keeps **Add provider** as the primary action. Each saved row shows
its nickname, platform, budget preference and **Saved configuration**, not a
connection-health claim. The always-visible three-dot **Provider actions for
<nickname>** button opens Edit provider, Replace API key and a separated dangerous
Delete provider action. Enter/Space or ArrowDown opens the menu, arrows and
Home/End move between actions, and Escape closes it and returns focus to the row
button. Tab or an outside interaction dismisses the menu. Cancelling or completing
a maintenance dialog returns to that persistent row button; after deletion removes
the row, focus returns to Refresh providers. These are the implemented interaction
rules; the recorded Settings browser evidence and snapshot-specific user visual
acceptance are described below, separately from the new personal workspace.

Ordinary maintenance text does not display the UUID. The same stable UUID still
identifies API requests, task references and system credentials; hiding it does
not replace, regenerate or rename that identity.

| Field or operation | User flow and purpose | Save, read, and effect | Limits and recovery |
| --- | --- | --- | --- |
| Provider ID and platform | Add a provider by choosing OpenAI or DeepSeek; the stable UUID identifies its configuration and credential. | Provider platform, UUID, display name and optional monthly budget are stored in the local `app_settings` SQLite snapshot and returned by `GET /settings`. UUID and platform are fixed when editing an existing provider. | The public settings response excludes API keys. A configured DeepSeek provider remains supported as stored configuration, but current posting parsing only supports OpenAI. |
| Display name | Add or edit a provider nickname so its row and parsing-provider choice can be recognized. | Creation uses `POST /settings/ai/providers`; edits use `PATCH /settings/ai/providers/{provider_key}`. The backend trims and validates the name and saves a complete settings snapshot while preserving other settings. The API Settings view uses the returned provider object to update the matching row. | On failure, the dialog retains its draft and shows a safe error. If a write result is uncertain, refresh Settings before retrying; writes are not automatically retried. |
| Monthly budget (USD) | Optional metadata for the user's own budget preference. Blank means no budget value; `0` is a saved zero, distinct from blank. | Saved with the provider metadata in SQLite and displayed in the provider row. | This value does **not** enforce a spending limit, measure usage, or prevent provider calls. Finite, non-negative numbers are accepted by the current UI/API contract. Native number-input `badInput` and non-finite browser input are not automatically covered by the current frontend suite. |
| API key | Add a key when creating a provider or choose Replace API key to enter a new key without displaying the existing one. | The UI sends the key only in the write request. The backend stores it under the provider UUID in the current OS user's native credential store (macOS Keychain, Windows Credential Manager, or Linux Secret Service); it is not placed in the SQLite settings snapshot or returned by `GET /settings`. Replacing it uses `PUT /settings/ai/providers/{provider_key}/api-key`. | Key format and provider acceptance are not tested on save. The running environment must provide its system credential service; Linux requires an available Secret Service session and supporting libraries. If credential access fails, the app returns a sanitized error. A failed operation may be explicitly confirmed compensated or reported as uncertain; refresh does not verify the key. Do not paste keys into browser storage, logs, test fixtures, or support reports. |
| Delete provider | Delete uses a confirmation checkbox for an unreferenced provider. The user must first clear any task selection using it; the interface does not silently disconnect tasks. | `DELETE /settings/ai/providers/{provider_key}` removes the provider configuration and stored key. Any task reference rejects deletion (`409`) without automatic unbinding. | SQLite and OS credential storage are separate stores, not one atomic transaction. On an operation failure, bounded compensation verifies the prior state where possible and returns a fixed error; if either store cannot be verified, the response marks the relevant state as uncertain. Do not infer rollback from an error. Refresh settings to inspect configuration, and check the OS credential store through its normal system tools if the key state is reported uncertain. |

## Posting parsing selection

The section first shows the **Current saved selection** for the next Analyze
request, or explicitly shows **Environment credentials and the built-in default
model** when no selection is saved. This summary reads the latest loaded or saved
public snapshot, never the input draft. It makes no claim that the environment
credentials, account or model are available.

Choose **Edit parsing settings** to open an inline **Edit draft**. **Save parsing
settings** sends the existing PUT and uses its response to update the summary and
close the draft; a failure keeps the draft and the safe error/reconciliation
instructions. **Cancel parsing changes** discards and hides the draft without a
write, including an unchanged draft. **Use environment defaults** is available in
the editor for an existing selection and explicitly sends DELETE for only
`posting_parse`; it is not an inferred fallback. Cancelling or saving returns to
the Edit button. Saving disables the draft controls and prevents local duplicate
submissions; Refresh and provider maintenance cannot write concurrently.

Models are still entered by technical ID. The editor describes the required
OpenAI Responses structured outputs and web search capability for URL parsing.
The expandable technical note names `gpt-5.6-luna` only as a code-default example,
**not** a tested recommendation or verified catalog. Account/model availability
must be checked separately. The summary keeps the safety and cost boundary
visible: saving makes no AI call, Analyze sends the imported posting to OpenAI and
may incur charges, and saved budgets do not enforce a limit.

| Setting or operation | User flow and purpose | Save, read, and effect | Limits and recovery |
| --- | --- | --- | --- |
| `posting_parse` provider and model | In Settings → API, choose an OpenAI provider and enter a model used by the existing Analyze action. This setting exists because posting parsing is the current consumer; it is not a general-purpose task selector. | `PUT /settings/ai/tasks/posting_parse` stores task name, provider UUID and model in the same local SQLite settings snapshot. The next explicit Analyze/parse request reads one current snapshot, gets the selected UUID's key from system credential storage and passes that key/model to the existing OpenAI Responses parser. The parser/client is created for the request and closed afterward; credentials and models are not cached across requests. | Saving does not contact OpenAI or validate key/model availability. Only OpenAI is supported for parsing. A missing or invalid saved provider/key/settings causes a safe error rather than a fallback. The UI retains a failed draft; close/refresh and reload settings to reconcile an unknown write result. An already running parse is not cancelled or retargeted by a settings change. |
| Clear selection / environment default | Select Use environment defaults to remove the saved `posting_parse` choice. This is the explicit way to restore the pre-selection path. | `DELETE /settings/ai/tasks/posting_parse` removes just this task selection. A later explicit Analyze request with no saved selection uses the existing environment credential path (`OPENAI_API_KEY`) and the parser's built-in default model. | This path is not silently selected when a saved provider or credential is invalid. Settings changes themselves do not make AI calls. No DeepSeek parser adapter or model catalog is implemented. |

The `.env.local` `OPENAI_API_KEY` setup in the root README is for the explicit
environment/default path. When a provider key is stored in Settings, the backend
requires access to the operating system's native credential service at runtime.
Neither configuring a key nor saving a model proves external connectivity or
model availability.

## Persistence, concurrency, and recovery boundaries

`SettingsStore` stores one complete validated non-secret settings snapshot in
the `app_settings` table of the local SQLite database. Writers preserve fields
they do not own. The AI settings routes serialize their read-modify-write and
credential operations with a lock shared by that router instance; this does not
coordinate other application processes or make SQLite and the OS credential
store atomic together. Invalid stored settings are not silently replaced with
defaults.

All write requests are single attempts. Network errors, unreadable success
responses, or server errors may leave the caller unsure whether a write
committed. The interface does not automatically retry such requests: use
Refresh providers and parsing settings to reload saved configuration before a
manual retry. Refresh cannot read back or validate a secret. For deletion or
key replacement, sanitized server errors distinguish verified restoration from
credential/settings state that could not be confirmed; do not report those
cases as a successful rollback.

The API management dialogs keep edits as local drafts, disable duplicate writes
while saving, block Escape/Cancel during a write, and retain drafts on ordinary
failure. Closing or leaving discards local drafts; it does not cancel a request
already sent. Reopening a management dialog uses the parent's most recently
loaded or saved public snapshot, **not** a new network read; Refresh or re-entering
the API section performs `GET /settings`. A replacement-key input begins empty.
This does not claim secure erasure from process memory. Parsing drafts likewise
disappear on API exit or Refresh. Navigation does not cancel a sent write; return
and Refresh to reconcile its result before retrying. Refresh does not verify a key.

## Evidence and limitations

The earlier author-time pending-validation note was superseded by the Settings
checkpoint **546050b0c85e7edfcf3c396899d328e9257602cd**. Sol xhigh independently
reviewed the product, Claude-authored tests and actual page evidence in
`msg_13c6df65d001SWqAYgBkH4qM1j.json`. Runner `run-cef506e8d2193bee` recorded
**29 browser tests**, **28 request tests**, **947 backend tests**, and successful
lint/build/test-types/diff checks. The 29 include the earlier 25 plus parsing-draft
cancellation, keyboard menu use, and two viewport evidence scenarios. The archived
manifest `operator-stage-review-materials-20261014/manifest.json` records 16 PNGs
and two geometry files at 1440×1000 and 900×1000. The controlled decision
**D56231d95** accepted that exact Settings visual checkpoint. This resolves the
documentation lag identified as SET-ST1-DOC1, not a fresh execution or new review.

Stage-0 images remain comparison baselines, not current-page results. The Settings
approval does not approve the new Profile/Goal/Match layout. Its new behavior,
screenshots, keyboard checks and current lint/build/regression results remain
pending the assigned tester, deterministic runner and independent stage review.
Real browser-to-backend, native keyring and supplier behavior are not established
by the Settings mock/temporary-database evidence. No live product calls were made
or are authorized in this Profile/Goal/Match source unit.

The earlier `066cd76` behavior snapshot reported 21 browser tests passed; this is
historical evidence and is not rewritten to include later scenarios. On the later
stage-three snapshot, runner `run-1971b93ed58b6b13` recorded two browser runs of
25 passed each. The four added App scenarios cover: Profile initial-load failure,
retry, actual save, Home consumption and Profile re-entry; parsing validation,
pending-save controls, failed-draft retention and re-entry; a lost provider-edit
response reconciled by explicit refresh; and a lost parsing-selection response
reconciled by refresh using the server's saved selection. These recovery tests
use closed mocks and do not establish real persistence or provider behavior.

The reviewed behavior snapshot's local evidence includes backend tests using
temporary SQLite and fake credential/client objects; frontend Node request tests
using fake `fetch`; and Chromium App interactions using closed HTTP/WebSocket
mocks. The recorded stage-two backend run reported 947 passed. The stage-three
frontend runner reported 28 request tests passed, two 25-pass browser runs,
successful lint/build/test-TSX checks, the targeted existing duplicate-submit
mutation, and `git diff --check`. These
results are local evidence for their recorded snapshots, not real user data,
system-credential-service or external-provider acceptance.

The duplicate-submit mutation targets the existing provider-creation guard; it
does not serve as mutation evidence for the new management flows. The component
bridge's `component suite` assertion includes every failing component's text,
including `Duplicate submission`, so the target failure is identifiable rather
than a generic browser startup failure. The native idle creation dialog has no
independent mutation; management dialogs likewise lack dedicated idle close or
focus mutations. Non-finite budget and native `badInput` cases are not automated.
The browser suite does not establish visual, responsive, cross-browser, real
backend, live keyring or live provider behavior. The runner did not record Node
or Playwright binary fingerprints; identical runtime binaries must not be
claimed.

The remote `Python 3.12` and `Frontend` checks are a separate delivery gate for
the exact final reviewed commit, after final dual review and controller
submission. The local checks above, earlier checkpoint runs, and CI configuration
do not prove that exact remote gate has passed.

The Add provider dialog saves a provider and its API key. Configure posting
parsing separately in the Posting parsing section described above; only OpenAI
providers are supported for parsing.
