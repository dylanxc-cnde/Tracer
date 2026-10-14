# Settings tests

## Automated Chromium regression

From `frontend/`, install locked dependencies and Chromium, then run:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Playwright discovers `settings-providers.browser.test.mjs`, which imports the
management scenarios from `settings-management.browser.test.mjs`. The runner
starts a loopback Vite server at `127.0.0.1:4173`, uses one worker, bounded
timeouts and no retries. All API HTTP and WebSocket requests in App scenarios
are explicitly mocked before navigation; unexpected requests are blocked. No
real backend, database, OS credential store, API key or external provider is
used.

For the reviewed behavior snapshot at `066cd76334b54e231680074f64f9ccdcf9d434b4`,
the final browser run reported **21 passed**. It included 15 Settings management
App scenarios (display-name save/clear/cancel/failure and Home reload; provider
edit, key replacement, confirmed and reference-blocked deletion; posting-parse
selection/clear; validation, pending-write protection, and safe failure recovery),
five existing Add provider App scenarios, and the component-suite bridge. The
browser count describes that run, not a guarantee about future runs.

The bridge opens `/tests/settings-providers.html` without `?preview` and runs the
existing React StrictMode component suite with its own fake fetch. It requires
exactly 16 result entries and `16 passed, 0 failed`; the fixed count and summary
must change with the component list. Its Playwright assertion error contains
each failing component's text. The targeted duplicate-submit mutation removes
the existing synchronous creation guard and expects the component assertion
containing `Duplicate submission` to fail; the recorded mutation failed at its
target assertion with production source unchanged, and the subsequent normal
browser run passed. This mutation evidence concerns the existing creation
guard, not the new management functionality.

The native idle creation-dialog test has green-run evidence but no independent
mutation. The management dialogs have no dedicated idle close/focus mutation.
Non-finite budgets and native number-input `badInput` are not automatically
covered. Empty or discarded key inputs do not prove secure memory erasure.
Mocked App behavior does not establish real settings persistence, OS credential
storage, external provider access, all navigation races, HTTP cancellation,
other-browser compatibility, responsive behavior or visual acceptance.

## Separate request tests and component inspection

Run request-layer tests and the component TSX type check from `frontend/`:

```sh
node --test tests/settings-api.test.mjs
npx tsc -p tests/tsconfig.json
```

The latest recorded request-test run reported **28 passed**. These Node 24 tests
use fake `fetch` and separately check request methods/payloads, response
validation, safe errors and no automatic retry; they are not additional browser
interactions. The TSX type check covers the component suite and its imports, not
the browser `.mjs` files. Neither check is part of `npm run build`.

To inspect the component results manually, start Vite and open
`/tests/settings-providers.html`. The page reports each assertion and the final
pass/fail count. It is a development entry, excluded from the production build;
the `preview` query renders the existing Settings page with fake, memory-only
settings. All requests are replaced by closed fake fetch; unexpected URLs throw,
the page Content Security Policy blocks the backend origin, and no system
credential store is used. Never enter real keys.

## Backend, static checks, and delivery evidence

Backend settings and parser integration tests use temporary SQLite and fake
credential/client implementations. The reviewed stage-two backend run reported
**947 passed**; it did not use real OS credentials or call OpenAI. The frontend
runner also recorded lint, build, the 28 Node request tests, the test TSX type
check, 21 browser passes, the targeted duplicate-submit mutation, a post-mutation
21-pass browser run, and `git diff --check` as successful on the reviewed
behavior snapshot. A fake client and mocked browser are not live external or
system-credential acceptance. No Node/Playwright binary fingerprint was recorded,
so do not claim runtime binaries matched other runs.

CI's `Frontend` job runs `npm ci`, lint, build, installs Chromium and runs the
browser suite; it does not run the separate Node request tests or
`tsc -p tests/tsconfig.json`. The `Python 3.12` and `Frontend` remote checks are
required for the exact final reviewed commit only after the final dual review
and controller submission. Earlier checkpoint or local results do not establish
that remote gate as passed.

Chromium also needs OS runtime libraries. If launch reports a missing library
(for example `libnspr4.so`), report an environment failure, not a passing test or
a meaningful product regression. This test procedure does not install system
packages or grant permission to do so.
