# Settings tests

No additional test dependency is needed. Use Node 24 for the request tests:

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
