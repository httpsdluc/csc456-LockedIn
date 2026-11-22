# metrics

Scripts that collect sprint report numbers (PRs, reviews, reviews per PR).

- Owner: Diana

## github_metrics.py

Counts PRs, code reviews and reviews per PR for one sprint, overall and per person.
This fills team metrics vii, viii and ix and individual metrics ii and iii.

```bash
# Markdown summary with links, ready to paste into the report
python scripts/metrics/github_metrics.py --since 2026-11-10 --until 2026-11-23 --markdown

# Full JSON
python scripts/metrics/github_metrics.py --since 2026-11-10 --until 2026-11-23
```

Rules:

- A PR counts if it was opened or merged during the sprint.
- A review counts if it was submitted during the sprint. Bot reviews (Copilot,
  Dependabot), self-reviews and pending reviews are skipped.
- Reviews per PR = reviews in the sprint / PRs in the sprint.

Python 3.9+ standard library only. Set `GITHUB_TOKEN` to raise the API limit
from 60 to 5,000 requests an hour.

Tests: `python -m unittest discover scripts/metrics`
