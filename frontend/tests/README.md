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
`settings-providers.browser.test.mjs` is discovered: two headless Chromium tests,
one worker, bounded timeouts and no retries. The existing Frontend CI job is
configured to run this command after its original lint/build checks; Python CI
is unchanged. Workflow configuration and local results do not prove that remote
CI has passed; check the exact commit's GitHub Actions results separately.

Both tests navigate the real App through Settings → API → Add provider using
closed HTTP and WebSocket mocks. The failure case supplies one existing provider
and a known creation failure, with a fake secret marker in the raw error. It
checks the single POST payload, safe error, unchanged list, retained
platform/name/key/budget draft, masked key, and re-enabled controls. The success
case returns a new provider with a server-selected name and checks the single
POST payload, appended server result and retained existing item, no extra GET,
dialog removal, no visible fake key, and an empty password input on reopening.
Reopening with an empty key does not prove secure memory erasure. No real
backend, database, credential store or external provider is used. Do not enter
real credentials in test fixtures.

These are two mocked-API Chromium behavior regressions, not full frontend
acceptance. The remaining manual component cases below, real backend persistence
and credential storage, external providers, other browsers, responsive layout
and visual acceptance are not automated by this command.

Chromium also needs OS runtime libraries. If launch reports a missing library
(for example `libnspr4.so`), browser installation alone is insufficient: report
the environment failure, not a passing test or meaningful regression failure.
This command does not install system packages or grant permission to do so.

## Existing request and manual component tests

The request tests require no separate test framework. Use Node 24:

```sh
cd frontend
node --test tests/settings-api.test.mjs
npx tsc -p tests/tsconfig.json
```

For the component tests, start the existing Vite development server and open
`/tests/settings-providers.html`. The page runs the real components in React
StrictMode and reports each assertion plus the final pass/fail count. This is
a browser-run suite, not part of `npm run build` or the command-line API tests.

The suite covers loading and read errors, refresh, budget values, form validation,
both platforms, successful creation, draft retention, error sanitization,
duplicate submission, blocked closing while saving, focus restoration, and
late GET/POST responses after unmount. Native keyboard/backdrop behavior and
responsive layout should also be checked using the isolated preview link.

All requests are replaced by a closed fake fetch implementation before mounting.
Unexpected URLs throw; no request falls through to the real backend. The page's
Content Security Policy additionally blocks the backend origin. Keys are fake,
and no system credential store is used. Preview changes are memory-only and
reset on reload. Do not enter real keys in this page.

The test HTML is a separate development entry, not included in the production
build. Its `preview` query renders the existing Settings page with fake settings
for visual inspection; production components do not contain test modes.
