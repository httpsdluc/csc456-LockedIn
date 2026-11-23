# Unit tests and coverage (SCRUM-32)

Both packages use Vitest with V8 coverage. The web package also uses React Testing
Library and jsdom to test components without a browser or running API.

Use Node 20.19 or newer (CI uses Node 20). Install each package's dependencies
with `npm ci`; run the commands below from the repository root.

| Command | API | Web |
| --- | --- | --- |
| Install | `npm --prefix api ci` | `npm --prefix web ci` |
| Run once with coverage | `npm --prefix api test` | `npm --prefix web test` |
| Explicit coverage command | `npm --prefix api run test:coverage` | `npm --prefix web run test:coverage` |
| Watch tests while editing | `npm --prefix api run test:watch` | `npm --prefix web run test:watch` |

Both one-shot commands fail if statements, branches, functions, or lines fall
below 80%. Reports are written relative to each package:

- Terminal: coverage table alongside test results.
- `coverage/index.html`: interactive report showing uncovered code.
- `coverage/coverage-summary.json`: percentages for automated consumers.

The existing API/web CI matrix runs `npm test`, so these thresholds apply there
without changing the workflow shared with the Playwright PR. Posting coverage
comments on PRs belongs to SCRUM-33; this setup generates the reports.

## Test scope

- API: validation, UTC date helpers, fixtures, and the in-memory store have unit
  tests; Supertest also exercises HTTP routes in the same suite. No external
  database or server process is needed. Coverage includes `src/**/*.ts` except
  `server.ts`, which only wires environment variables and starts the listener.
- Web: tests cover the page, dashboard, meal form, and API client. Live API calls
  are mocked. Tests default to demo mode even if a deployment API URL is present;
  connected-mode tests explicitly set their own URL. Coverage includes the page,
  components, and library logic, excluding static fixtures. The root layout is
  framework/font wiring and is outside this coverage scope.

Put API tests in `api/test/*.test.ts` and frontend tests in
`web/test/*.test.ts` or `web/test/*.test.tsx`. Test observable behavior and error
cases, and keep mocks isolated between tests. Browser UI tests are maintained
separately in `e2e/` under SCRUM-35.
