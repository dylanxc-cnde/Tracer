# Settings tests

## Automated Chromium regression

From `frontend/`, install the locked dependencies and Chromium, then run:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Playwright starts its own loopback Vite server at `127.0.0.1:4173` with a strict
port and does not reuse an existing server. Only
`settings-providers.browser.test.mjs` is discovered: six headless Chromium tests,
one worker, bounded timeouts and no retries. The existing Frontend CI job is
configured to run this command after its original lint/build checks; Python CI
is unchanged. Workflow configuration and local results do not prove that remote
CI has passed; check the exact commit's GitHub Actions results separately.

Five tests navigate the real App through Settings → API → Add provider using
closed HTTP and WebSocket mocks. The failure case supplies one existing provider
and a known creation failure, with a fake secret marker in the raw error. It
checks the single POST payload, safe error, unchanged list, retained
platform/name/key/budget draft, masked key, and re-enabled controls. The success
case returns a new provider with a server-selected name and checks the single
POST payload, appended server result and retained existing item, no extra GET,
dialog removal, no visible fake key, and an empty password input on reopening.
The validation case checks empty and whitespace-only display names and API keys,
and a negative monthly budget, each with the other fields valid in the same dialog.
It checks the exact error message, focus on the invalid field, unchanged four-field
draft and saved list, masked key, open dialog, idle form and enabled controls,
and zero POSTs. Any accidental POST receives a fixed fake error, never a real request.
The pending-response case waits for a POST-arrival signal and holds a fixed 500
response behind an explicit gate, without fixed sleeps. While pending it checks
`aria-busy`, the saving notice, disabled fields/submit/Cancel/X, and real keyboard
Escape with a read-only native cancel observer. The dialog remains visible/open,
the four-field draft and saved list stay unchanged, and the key stays masked.
Releasing the failure restores the idle form and all controls without losing the
draft or list; editing a field and cancelling then works. Only one POST with the
expected payload occurs. The gate is also released in `finally` on assertion failure.
The idle-dialog case checks an initially empty password input, then real backdrop
clicks at a point outside the dialog and inside the viewport without closing it or
changing the draft/list. Cancel, X and native keyboard Escape each close the dialog,
return focus to Add provider, and discard the draft: reopening after each restores
the initial fields and an empty, masked key. The whole case checks zero POSTs.

The remaining test is a component-suite bridge: it opens
`/tests/settings-providers.html` without `?preview` and executes the existing
React StrictMode suite with its own closed fake fetch, not the App-route API mock.
It checks the final status, zero FAIL entries, exactly 16 result entries and
`16 passed, 0 failed`; every component result is included in assertion errors.
The fixed count and summary deliberately couple this completeness check to the
component case list. Adding/removing component cases requires updating both
integrity assertions alongside that list; a passing empty suite is not sufficient.

Targeted isolated mutation evidence covers two guards: removing the saving guard
in `handleClose` fails at the pending case's post-Escape dialog assertion; removing
the synchronous duplicate-submit guard fails through the bridge with the component
failure text `Duplicate submission`. Neither red result is a browser-startup error.
These are targeted detection checks, not proof of every race or every assertion.
The native idle case has green-run evidence but no independent isolated mutation.
Reopening with an empty key does not prove secure memory erasure. No real
backend, database, credential store or external provider is used. Do not enter
real credentials in test fixtures.

These are five App-level mocked-API cases and one component-suite bridge, not full frontend
acceptance. Non-finite budgets and native number-input `badInput` are not covered
automatically. Real backend persistence and credential storage, external providers,
other browsers, responsive layout and visual acceptance are not automated by this
command. The component suite's fake-fetch unmount/late-response checks do not prove
all real navigation races, HTTP cancellation or backend rollback. Empty or discarded
UI key values do not prove secure memory erasure.

Chromium also needs OS runtime libraries. If launch reports a missing library
(for example `libnspr4.so`), browser installation alone is insufficient: report
the environment failure, not a passing test or meaningful regression failure.
This command does not install system packages or grant permission to do so.

## Separate request tests and component inspection

The 12 request-layer tests use Node 24's built-in test runner and fake fetch.
They check request payloads, safe response/error handling and no automatic retry;
they are separate from `npm run test:browser`, not another 12 browser interactions.
Run them and the component TSX type check from `frontend/`:

```sh
node --test tests/settings-api.test.mjs
npx tsc -p tests/tsconfig.json
```

To inspect the component results manually, start the Vite development server and open
`/tests/settings-providers.html`. The page runs the real components in React
StrictMode and reports each assertion plus the final pass/fail count. This is
a browser-run suite now also executed by the Playwright bridge, not part of
`npm run build` or the command-line request tests. `tests/tsconfig.json` checks
the TSX suite and its imports; it does not type-check the browser `.mjs` file.

The suite covers loading and read errors, refresh, budget values, form validation,
both platforms, successful creation, draft retention, error sanitization,
duplicate submission, blocked closing while saving, focus restoration, and
late GET/POST responses after unmount. Unknown-result recovery checks that no retry
is automatic and that closing then refreshing can reconcile a fake saved provider.
Native keyboard/backdrop coverage comes from the separate App cases, not synthetic
component events. Responsive layout and visual inspection remain manual.

All requests are replaced by a closed fake fetch implementation before mounting.
Unexpected URLs throw; no request falls through to the real backend. The page's
Content Security Policy additionally blocks the backend origin. Keys are fake,
and no system credential store is used. Preview changes are memory-only and
reset on reload. Do not enter real keys in this page.

The test HTML is a separate development entry, not included in the production
build. Its `preview` query renders the existing Settings page with fake settings
for visual inspection; production components do not contain test modes.
