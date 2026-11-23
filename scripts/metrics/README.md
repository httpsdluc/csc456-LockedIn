# metrics

Scripts and workflows that collect the sprint report numbers.

- Owner: Diana

## GitHub metrics script

```bash
node scripts/metrics/github-metrics.mjs --since 2026-11-09 --until 2026-11-23
```

Needs the GitHub CLI signed in (`gh auth login`). Add `--json` for machine-readable output, `--repo owner/name` to point at another repo. Defaults to the last 14 days.

| Report metric | What the script prints |
|---|---|
| v Backend build time | Median and range of each CI job, and of its build step |
| vi Build to deployment time | Median merge-to-live time from the Deploy time workflow |
| vii Code submissions | PRs total, opened and merged in the window, by author |
| viii Code reviews | Reviews and approvals, by reviewer (no self-reviews or bots) |
| ix Reviews per PR | Reviews ÷ PRs and approvals ÷ PRs |
| iv Heartbeat | Pass rate of the scheduled Heartbeat workflow |
| xv CI pass rate | Passed ÷ finished CI runs |

## Workflows

- `.github/workflows/deploy-time.yml` runs on every push to main that touches `api/` or `render.yaml`. It polls `/health` until it reports the new commit and records the seconds from merge to live in the step summary and a `deploy-time-<sha>` artifact.
- `.github/workflows/heartbeat.yml` runs the Playwright suite against production every hour (`BASE_URL`), plus 5 timed requests each to the web app and API `/health`. Pass rate and average latency are in the step summary and the `heartbeat-<run id>` artifact. Run it by hand from the Actions tab with "Run workflow".
