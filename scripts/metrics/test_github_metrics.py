"""Tests for github_metrics.summarize. Run: python -m unittest discover scripts/metrics"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from github_metrics import parse_day, summarize, to_markdown  # noqa: E402


def pr(number, author, created, merged=None, state="open"):
    return {"number": number, "title": "PR %d" % number, "user": {"login": author},
            "created_at": created, "merged_at": merged,
            "state": "closed" if merged else state,
            "html_url": "https://github.com/o/r/pull/%d" % number}


def review(login, submitted, state="APPROVED", rid=1):
    return {"user": {"login": login}, "state": state, "submitted_at": submitted,
            "html_url": "https://github.com/o/r/pull/x#pullrequestreview-%d" % rid}


SINCE = parse_day("2026-11-10")
UNTIL = parse_day("2026-11-24")  # exclusive, so the sprint ends 11/23


class SummarizeTest(unittest.TestCase):
    def test_counts_prs_opened_or_merged_in_window(self):
        pulls = [
            pr(1, "ana", "2026-10-26T10:00:00Z", merged="2026-10-26T12:00:00Z"),  # before
            pr(2, "ben", "2026-10-26T10:00:00Z", merged="2026-11-12T12:00:00Z"),  # merged in
            pr(3, "ana", "2026-11-15T10:00:00Z"),                                 # opened in
            pr(4, "ben", "2026-11-24T00:00:00Z"),                                 # after
        ]
        m = summarize(pulls, {}, SINCE, UNTIL)
        self.assertEqual([p["number"] for p in m["prs"]], [2, 3])
        self.assertEqual(m["merged_count"], 1)
        self.assertEqual(m["prs_without_review"], [2, 3])

    def test_skips_bots_self_reviews_pending_and_out_of_window(self):
        pulls = [pr(5, "ana", "2026-11-11T10:00:00Z")]
        reviews = {5: [
            review("ben", "2026-11-12T10:00:00Z"),
            review("ana", "2026-11-12T11:00:00Z", "COMMENTED"),          # self
            review("copilot-pull-request-reviewer", "2026-11-12T11:00:00Z"),
            review("dependabot[bot]", "2026-11-12T11:00:00Z"),
            review("cy", None, "PENDING"),
            review("cy", "2026-11-09T23:59:59Z"),                          # before
            review("cy", "2026-11-20T09:00:00Z", "CHANGES_REQUESTED"),
        ]}
        m = summarize(pulls, reviews, SINCE, UNTIL)
        self.assertEqual([(r["reviewer"], r["state"]) for r in m["reviews"]],
                         [("ben", "approved"), ("cy", "changes_requested")])
        self.assertEqual(m["reviews_per_pr"], 2.0)
        self.assertEqual(m["prs_without_review"], [])

    def test_review_on_older_pr_still_counts(self):
        pulls = [pr(1, "ana", "2026-10-26T10:00:00Z")]
        m = summarize(pulls, {1: [review("ben", "2026-11-15T10:00:00Z")]}, SINCE, UNTIL)
        self.assertEqual(m["pr_count"], 0)
        self.assertEqual(m["review_count"], 1)
        self.assertEqual(m["reviews_per_pr"], 0.0)  # no PRs in window, no divide by zero
        self.assertIn("ben", m["people"])

    def test_markdown_lists_each_person(self):
        pulls = [pr(7, "ana", "2026-11-11T10:00:00Z")]
        m = summarize(pulls, {7: [review("ben", "2026-11-12T10:00:00Z", rid=99)]}, SINCE, UNTIL)
        md = to_markdown(m)
        self.assertIn("2026-11-10 to 2026-11-23", md)
        self.assertIn("| ana | [#7](https://github.com/o/r/pull/7) (open) | none |", md)
        self.assertIn("pullrequestreview-99", md)


if __name__ == "__main__":
    unittest.main()
