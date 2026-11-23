# csc456-LockedIn

CSC 456 team project.

## Repo layout

| Folder | What | Owner |
|---|---|---|
| `api/` | Express + TypeScript backend | |
| `web/` | Next.js frontend | |
| `e2e/` | Playwright UI + heartbeat tests | |
| `infra/` | Deploy, logs, DB performance | |
| `scripts/metrics/` | Sprint report metric scripts |  |
| `.github/workflows/` | CI/CD | |

How the pieces talk to each other: [CONTRACT.md](CONTRACT.md).

## Workflow

We track work on the [LockedIn project board](https://github.com/users/httpsdluc/projects/1)
(Backlog → To Do → In Progress → In Review → Done). Sprints 0–2 were tracked in Jira;
each GitHub issue keeps its old `SCRUM-N` key in the title.

1. Pick an issue from **To Do**, assign yourself and move it to **In Progress**.
2. Branch off `main`: `git checkout -b <yourname>/<short-description>`.
3. Open a PR using the template and write `Closes #<issue>` in the description,
   so the issue closes when the PR merges. Move the issue to **In Review**. CI must pass.
4. Get one approving review from a teammate, then merge.
5. Never push directly to `main`.

Every sprint, each teammate opens at least 1–2 PRs and reviews at least 3–4 PRs,
and links them in the sprint report.

## Sprint reports

| Report | Due |
|---|---|
| Sprint 1 | 10/26 |
| Sprint 2 | 11/9 |
| Sprint 3 | 11/23 |
| Sprint 4 | 12/7 |
