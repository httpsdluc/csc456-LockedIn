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

The API/web CI matrix runs `npm test`, enforcing these thresholds. Publishing
coverage comments is handled separately from test execution, as described below.

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

## PR coverage comments (SCRUM-33)

CI uploads each package's JSON summary as `coverage-api` or `coverage-web`, even
when tests fail. The `PR coverage comment` workflow runs after CI finishes and
creates or updates one bot comment with statements, branches, functions, and
lines for both packages, plus the commit and a link to the CI run. Missing or
invalid reports are marked **Unavailable**, never silently reported as 0%.
Percentages are informational; failing tests and coverage thresholds still fail CI.

The publisher uses `workflow_run`, reads reporting code only from the default
branch, and never installs or executes PR code or artifact contents. PR CI has a
read-only token; only the separate publisher has permission to comment. PR
identity comes from GitHub's API, not a file supplied by a PR. Reports for older
commits, closed PRs, or superseded run attempts do not replace the current comment.
Fork PRs are supported through commit-to-PR lookup when the run has no PR metadata.

GitHub only triggers `workflow_run` workflows once they exist on the default
branch. Therefore, the first coverage comment will appear after this reporting
setup is merged into `main` and a PR's CI runs again. Rerun CI (not just the
publisher) to generate fresh artifacts. Reports are retained for 14 days.

Run the publisher's local tests without installing dependencies:

```bash
node --test .github/scripts/post-coverage.test.cjs
```

After merging, verify on a PR that the displayed values match the two downloaded
coverage artifacts, then push another commit and confirm the same comment is
updated. A failing run or missing report should be identified clearly. Confirm
fork behavior on a fork PR after any required maintainer approval for CI.
