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

1. Pick a ticket in Jira.
2. Branch off `main`: `git checkout -b <yourname>/<short-description>`.
3. Open a PR using the template. CI must pass.
4. Get one approving review from a teammate, then merge.
5. Never push directly to `main`.

Every teammate opens at least 2 PRs and reviews at least 2 per sprint.
