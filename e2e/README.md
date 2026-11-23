# e2e

Playwright UI tests for SCRUM-35 and a production heartbeat for SCRUM-36.

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

## Production heartbeat (SCRUM-36)

Production target verified on 2026-11-22: `https://lockedin-sage.vercel.app`.
The deployed dashboard currently uses **demo** mode. Configure the following
GitHub Actions repository variables when wiring the scheduled workflow:

| Variable | Current value | Purpose |
| --- | --- | --- |
| `PRODUCTION_URL` | `https://lockedin-sage.vercel.app` | Exact dashboard URL to navigate to; HTTPS is required. |
| `HEARTBEAT_EXPECTED_MODE` | `demo` | Explicitly `demo` or `live`; change to `live` when the deployed dashboard connects to its API. |
| `HEARTBEAT_TIMEOUT_MS` | `30000` (optional) | Total readiness-test deadline, including navigation; whole milliseconds from 1000 to 120000. |

Repository variables are not automatically exported locally. In PowerShell:

```powershell
$env:PRODUCTION_URL = "https://lockedin-sage.vercel.app"
$env:HEARTBEAT_EXPECTED_MODE = "demo"
npm --prefix e2e run test:heartbeat
npm --prefix e2e run heartbeat:summary
```

The separate `playwright.heartbeat.config.ts` runs only `heartbeat/` using one
desktop Chromium worker, with no retries and no local web server. Both variables
are required; missing configuration fails instead of falling back to localhost.
The normal UI suite continues to run only `tests/` on desktop and mobile.

The heartbeat checks HTTP success, the production origin after redirects, the
LockedIn heading, visible numeric dashboard statistics, and the expected mode.
Loading, offline fallback, and an unexpected demo banner cannot pass a live-mode
check. It does not assert specific meal counts or totals, submit forms, or delete
meals. It works with an empty meal list and an exceeded calorie goal.

The `Production heartbeat` workflow runs at minutes 17 and 47 of each hour (UTC)
and supports **Run workflow** in GitHub Actions. Configure the required repository
variables under **Settings → Secrets and variables → Actions → Variables** before
enabling the scheduled run. Missing or invalid settings fail the check. The job
installs only e2e dependencies and Chromium; it does not build or start the app.
Scheduled execution starts after the workflow is merged into the default branch;
GitHub may delay scheduled runs, so the 30-minute cadence is not an exact SLA.

Each executed test writes `heartbeat.json` inside its generated directory under
`e2e/test-results/heartbeat/` and prints the same JSON in the workflow log. It
records UTC timestamp, target URL, expected mode, result, HTTP status when known,
readiness latency, elapsed time, and the failure reason when applicable.

Readiness latency uses a monotonic clock from immediately before navigation until
all dashboard checks pass. Browser setup and dependency installation are excluded.
Failures keep readiness latency `null` and record elapsed time instead. The
default deadline is 30 seconds for the entire test, with no retries; this is an
availability timeout, not a separate performance target. Configuration errors or
browser startup failures occur before the test and appear in the command log
without a per-test JSON file. The reporting step then publishes **unavailable**,
never an old success. One-shot heartbeat runs clear old JSON metrics before
loading Playwright configuration. Generated output is ignored by Git.

### Results and failure evidence

The scheduled/manual workflow always attempts summary publication and artifact
upload after the heartbeat step, including failed checks. The summary shows the
result, timestamp, URL, expected mode, HTTP status, latency, elapsed time, and
failure reason. It also uses the original test step outcome so setup/teardown
errors cannot appear successful just because per-test metrics passed.

Download **production-heartbeat** from the workflow run's Artifacts section. It
contains raw `heartbeat.json`, `heartbeat-summary.json`, and screenshots and traces
for failed browser checks. Artifacts are retained for 14 days. A configuration
or browser-startup failure may have only the summary; inspect workflow logs for
the underlying error. Tests and reporting return nonzero on failure, so publishing
evidence never turns a failed check green.

Open a downloaded trace with:

```bash
npx playwright show-trace path/to/trace.zip
```

### Controlled validation

```bash
npm --prefix e2e run test:heartbeat:validation
```

This runs 15 Node reporter tests and 15 controlled Chromium/configuration checks.
The browser tests intercept HTTPS requests locally; they never contact production
and do not require production repository variables. They exercise the same
dashboard checker used by the production heartbeat: healthy demo/live pages,
empty data, exceeded goals, HTTP errors, missing dashboard, stuck loading,
unexpected offline/demo fallback, invalid numbers, and navigation timeouts.
Configuration checks cover missing URL/mode, invalid mode, HTTP targets, and
invalid timeouts. Reporter tests cover missing/invalid/duplicate results, timing
validation, failure exit status, Markdown escaping, and stale-result cleanup.
Normal PR CI runs this command alongside the existing UI suite.

Before closing SCRUM-36, configure the repository variables, merge the workflow
into `main`, successfully run it manually, and verify at least one scheduled run.
Local production checks validate the test itself; they do not establish that the
GitHub schedule and repository settings are active.
