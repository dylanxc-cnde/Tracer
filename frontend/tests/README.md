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

For the earlier reviewed behavior snapshot at
`066cd76334b54e231680074f64f9ccdcf9d434b4`, the final browser run reported
**21 passed**. Preserve that count as historical evidence for that snapshot. On
the later stage-three snapshot, runner `run-1971b93ed58b6b13` reported **25 passed**
in both the initial and post-mutation browser runs. Those runs include 19 Settings
management/Profile/parsing App scenarios, five existing Add provider App
scenarios, and the component-suite bridge. Four added App scenarios cover Profile
load failure/retry followed by a save consumed by Home and re-entry; parsing
validation, pending-save protection, failure retention and re-entry; and lost
provider-edit and parsing-selection responses reconciled by explicit refresh
without automatic retry. The counts describe their respective recorded runs, not
a guarantee about future runs.

The later Settings checkpoint `546050b0c85e7edfcf3c396899d328e9257602cd`
has a recorded **29 passed** browser run in `run-cef506e8d2193bee`: the earlier
25 plus parsing-draft cancellation, native keyboard menu coverage and two
viewport evidence scenarios. Sol xhigh's independent combined stage review is
`msg_13c6df65d001SWqAYgBkH4qM1j.json`; the controlled decision D56231d95
subsequently accepted that checkpoint's Settings visuals. Preserve the older
21/25 counts as history, not current counts. The archived manifest
`operator-stage-review-materials-20261014/manifest.json` records 16 PNGs and
two geometry files for 1440×1000 and 900×1000. This is not live-provider evidence.

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

## Profile / Goal / local match integration (pending validation)

New personal-domain UI source is integrated in the real Settings Profile and
current Card reading mode. Initial Settings/ordinary Card entry does not request
personal or match endpoints; **Open Profile and Goal** and **Review match** are
explicit entry points. The assigned Claude tester still needs to author the
approved coherent browser group and import it through the discovered entry
above, without changing Playwright configuration or weakening existing tests.
This documentation does not predeclare test counts, screenshots or passing runs
for that new group. Existing Settings mocks remain closed.

The authorized group covers separate local confirmations/saves, skip/unknown,
failure retention, lost-response manual reads, stale-input reviews, judgment-only
correction, and original/editing Card boundaries. Profile/Goal facts remain local;
there is no live AI call to mock into a false automatic-match claim. Tests must
not silently upgrade facts or turn an absent evidence entry into a confirmed gap.
See `docs/profile-matching.md` for the API/operation contract and five approved
cases. Browser mocks check real App controls but not real SQLite persistence.
The new backend group must use temporary SQLite and verify app reconstruction,
snapshot references and unchanged Card/Settings data. It does not authorize
first-enable writes to the user's old database or claim a real browser/backend
end-to-end run. New behavior, static checks, images and visual acceptance are
pending; the unchanged 29-test Settings evidence is not a green run for new code.

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
runner `run-1971b93ed58b6b13` also recorded lint, build, the 28 Node request tests,
the test TSX type check, two 25-pass browser runs, the targeted duplicate-submit
mutation, and `git diff --check` as successful on its recorded stage-three
snapshot. The earlier 21-pass result remains tied to its earlier snapshot. A fake
client and mocked browser are not live external or
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
