# infra

Deploy config, log error counting, and DB performance queries.

- Owner: Diana Lucero

## Deploy time (metric vi)

`.github/workflows/deploy-time.yml` runs on every push to main that touches `api/` or `render.yaml`. It polls the API's `/health` until it reports the new commit, then records the seconds from merge to live in the run's step summary and a `deploy-time-<sha>` artifact. It fails if the commit isn't live within 25 minutes.

First measurement (PR #39, Nov 23): 137 s.

## CI and deploy metrics script

```bash
node scripts/metrics/ci-metrics.mjs --since 2026-11-09 --until 2026-11-23
```

Needs the GitHub CLI signed in (`gh auth login`). Add `--json` for machine-readable output.

| Report metric | What it prints |
|---|---|
| v Backend build time | Median and range of each CI job and its build step |
| vi Build to deployment time | Median merge-to-live time from the Deploy time workflow |
| iv Heartbeat | Pass rate of the Production heartbeat workflow |
| xv CI pass rate | Passed ÷ finished CI runs |

PR and review counts (vii, viii, ix) come from `scripts/metrics/github_metrics.py`.
