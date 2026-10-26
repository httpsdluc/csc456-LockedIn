# e2e

Playwright UI tests and the scheduled heartbeat test.

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
- `test.fixme` tests in `tests/dashboard.spec.ts` are placeholders for meal logging, blocked until the web app has a meal form.
