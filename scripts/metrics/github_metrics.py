#!/usr/bin/env python3
"""Count PRs, code reviews and reviews per PR for the sprint report.

Covers team metrics vii (code submissions), viii (code reviews) and
ix (average reviews per PR), plus individual metrics ii and iii.

Usage:
    python scripts/metrics/github_metrics.py --since 2026-11-10 --until 2026-11-23
    python scripts/metrics/github_metrics.py --since 2026-11-10 --markdown

Set GITHUB_TOKEN to raise the API rate limit (60 requests/hour without it).
Standard library only, so there is nothing to install.
"""
import argparse
import json
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

DEFAULT_REPO = "httpsdluc/csc456-LockedIn"
API = "https://api.github.com"
# Reviews from bots (Copilot, Dependabot) are not code reviews by a teammate.
BOT_SUFFIX = "[bot]"
BOT_LOGINS = {"Copilot", "copilot-pull-request-reviewer"}


def is_bot(login):
    return login.endswith(BOT_SUFFIX) or login in BOT_LOGINS


def parse_day(text):
    return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def parse_ts(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def get_json(url, token=None):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "lockedin-sprint-metrics",
    })
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get_all(url, token=None):
    """Follow ?page=N until a page comes back short."""
    items, page = [], 1
    while True:
        sep = "&" if "?" in url else "?"
        batch = get_json("%s%sper_page=100&page=%d" % (url, sep, page), token)
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def in_window(ts, since, until):
    return ts is not None and since <= ts < until


def summarize(pulls, reviews_by_pr, since, until):
    """Pure function: build the metrics from already-fetched API data.

    A PR counts for the sprint if it was opened or merged inside the window.
    A review counts if it was submitted inside the window, is not from a bot,
    and is not the author reviewing their own PR. Pending reviews are skipped.
    """
    people = defaultdict(lambda: {"prs": [], "reviews": []})
    prs = []
    reviews = []
    for pr in pulls:
        created = parse_ts(pr["created_at"])
        merged = parse_ts(pr["merged_at"]) if pr.get("merged_at") else None
        if not (in_window(created, since, until) or in_window(merged, since, until)):
            continue
        author = pr["user"]["login"]
        if is_bot(author):
            continue
        state = "merged" if merged else pr["state"]
        entry = {"number": pr["number"], "title": pr["title"], "author": author,
                 "state": state, "url": pr["html_url"]}
        prs.append(entry)
        people[author]["prs"].append(entry)

    for pr in pulls:
        for rv in reviews_by_pr.get(pr["number"], []):
            if rv.get("state") == "PENDING" or not rv.get("submitted_at"):
                continue
            login = (rv.get("user") or {}).get("login", "")
            if not login or is_bot(login) or login == pr["user"]["login"]:
                continue
            if not in_window(parse_ts(rv["submitted_at"]), since, until):
                continue
            entry = {"pr": pr["number"], "reviewer": login, "state": rv["state"].lower(),
                     "url": rv.get("html_url") or pr["html_url"]}
            reviews.append(entry)
            people[login]["reviews"].append(entry)

    prs.sort(key=lambda p: p["number"])
    reviews.sort(key=lambda r: (r["pr"], r["reviewer"]))
    for p in people.values():
        p["prs"].sort(key=lambda x: x["number"])
        p["reviews"].sort(key=lambda x: x["pr"])
    reviewed_prs = {r["pr"] for r in reviews}
    return {
        "since": since.date().isoformat(),
        "until": (until - timedelta(days=1)).date().isoformat(),
        "pr_count": len(prs),
        "merged_count": sum(1 for p in prs if p["state"] == "merged"),
        "review_count": len(reviews),
        # Reviews in the window divided by PRs in the window (metric ix).
        "reviews_per_pr": round(len(reviews) / len(prs), 2) if prs else 0.0,
        "prs_without_review": [p["number"] for p in prs if p["number"] not in reviewed_prs],
        "prs": prs,
        "reviews": reviews,
        "people": {k: dict(v) for k, v in sorted(people.items(), key=lambda kv: kv[0].lower())},
    }


def to_markdown(m):
    lines = [
        "## GitHub metrics, %s to %s" % (m["since"], m["until"]),
        "",
        "- PRs: %d (%d merged)" % (m["pr_count"], m["merged_count"]),
        "- Reviews: %d" % m["review_count"],
        "- Reviews per PR: %.2f" % m["reviews_per_pr"],
        "- PRs with no review yet: %s" % (", ".join("#%d" % n for n in m["prs_without_review"]) or "none"),
        "",
        "| Person | PRs | Reviews |",
        "|---|---|---|",
    ]
    for login, p in m["people"].items():
        prs = ", ".join("[#%d](%s) (%s)" % (x["number"], x["url"], x["state"]) for x in p["prs"]) or "none"
        rvs = ", ".join("[#%d](%s) (%s)" % (x["pr"], x["url"], x["state"]) for x in p["reviews"]) or "none"
        lines.append("| %s | %s | %s |" % (login, prs, rvs))
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=DEFAULT_REPO, help="owner/name (default: %(default)s)")
    ap.add_argument("--since", required=True, help="first day of the sprint, YYYY-MM-DD")
    ap.add_argument("--until", default=date.today().isoformat(),
                    help="last day of the sprint, YYYY-MM-DD, inclusive (default: today)")
    ap.add_argument("--markdown", action="store_true", help="print a Markdown table instead of JSON")
    args = ap.parse_args(argv)

    since = parse_day(args.since)
    until = parse_day(args.until) + timedelta(days=1)
    if until <= since:
        ap.error("--until must be on or after --since")

    token = os.environ.get("GITHUB_TOKEN")
    base = "%s/repos/%s" % (API, args.repo)
    pulls = get_all(base + "/pulls?state=all", token)
    reviews_by_pr = {pr["number"]: get_all("%s/pulls/%d/reviews" % (base, pr["number"]), token)
                     for pr in pulls}
    m = summarize(pulls, reviews_by_pr, since, until)
    sys.stdout.write(to_markdown(m) if args.markdown else json.dumps(m, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
