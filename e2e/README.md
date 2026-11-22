# e2e

Playwright UI tests for SCRUM-35.

- Owner: Atif Tausif

## Run the UI tests

```bash
cd e2e
npm install
npx playwright install chromium   # first time only
npm test                          # starts the web app from ../web on port 3100
npm run pass-rate                 # prints the pass rate from results/results.json
```

- `BASE_URL=https://... npm test` runs against an already-running site instead of starting `../web`.
- `WEB_DIR=path/to/web` points at a different copy of the web app.
- Tests live in `tests/`. CI runs them in the `e2e` job and posts the pass rate to the run summary (metric xiii).
- Requires the frontend from PR #4 (merge PR #2 and then PR #4 first).
- All 10 tests run on desktop and mobile Chromium: 20 checks with no skipped placeholders.
- Covers dashboard totals, progress, macros, meal rows, adding/deleting meals, and invalid-calorie feedback.
- The local server and CI build use demo mode (`NEXT_PUBLIC_API_URL` empty) for isolated, repeatable UI tests. External sites must also use demo mode; meal tests change only browser state.
- CI fails if the frontend is missing, runs the suite, publishes the pass rate even on test failures, and uploads JSON/HTML reports.
- Pass-rate reporting returns a failure for zero tests, failures, flaky tests, skipped tests, or runner errors, after writing the results and summary.
- Production heartbeat and API integration tests are separate from this UI suite.
