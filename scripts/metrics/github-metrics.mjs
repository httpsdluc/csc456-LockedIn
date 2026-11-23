#!/usr/bin/env node
// Collects the sprint report's GitHub metrics (team metrics v, vi, vii, viii, ix, iv, xv).
//
// Usage:
//   node scripts/metrics/github-metrics.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repo owner/name] [--json]
//
// Needs the GitHub CLI (`gh auth login`). Defaults: the last 14 days, the repo of the current checkout.
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const day = (d) => d.toISOString().slice(0, 10);
const since = opt("since", day(new Date(Date.now() - 14 * 864e5)));
const until = opt("until", day(new Date()));
const asJson = args.includes("--json");
const repo =
  opt("repo") ??
  execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { encoding: "utf8" }).trim();

const start = Date.parse(`${since}T00:00:00Z`);
const end = Date.parse(`${until}T23:59:59Z`);
const inWindow = (iso) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= start && t <= end;
};

// gh api --paginate with --jq emits one compact JSON value per line.
const ghLines = (path, jq) => {
  const out = execFileSync("gh", ["api", "--paginate", path, "--jq", jq], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const range = (xs) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
const secs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
const tally = (items, key) =>
  items.reduce((acc, x) => ((acc[key(x)] = (acc[key(x)] ?? 0) + 1), acc), {});

// --- Pull requests and reviews (vii, viii, ix) ---
const pulls = ghLines(`repos/${repo}/pulls?state=all&per_page=100`, ".[] | {number, user: .user.login, state, created_at, merged_at}");
const reviews = pulls.flatMap((pr) =>
  ghLines(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`, ".[] | {user: .user.login, state, submitted_at}")
    // Self-reviews and bots (e.g. Copilot) don't count as team reviews.
    .filter((r) => r.state !== "PENDING" && r.user !== pr.user && !r.user.endsWith("[bot]"))
    .map((r) => ({ ...r, pr: pr.number })),
);
const approvals = reviews.filter((r) => r.state === "APPROVED");
const prsOpened = pulls.filter((p) => inWindow(p.created_at));
const prsMerged = pulls.filter((p) => inWindow(p.merged_at));
const reviewsInWindow = reviews.filter((r) => inWindow(r.submitted_at));
const approvalsInWindow = approvals.filter((r) => inWindow(r.submitted_at));

// --- Workflow runs (v, vi, iv, xv) ---
const runsFor = (file) => {
  try {
    return ghLines(
      `repos/${repo}/actions/workflows/${file}/runs?per_page=100&created=${since}..${until}`,
      ".workflow_runs[] | {id, event, status, conclusion, head_sha, head_branch, created_at, run_started_at, updated_at}",
    ).filter((r) => r.status === "completed");
  } catch {
    return []; // workflow not on the default branch yet
  }
};
const passRate = (runs) => {
  const done = runs.filter((r) => ["success", "failure"].includes(r.conclusion));
  const ok = done.filter((r) => r.conclusion === "success").length;
  return { passed: ok, of: done.length, rate: done.length ? Math.round((ok / done.length) * 1000) / 10 : null };
};

const ciRuns = runsFor("ci.yml");
const jobDurations = {};
for (const run of ciRuns) {
  const jobs = ghLines(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`, ".jobs[] | {name, conclusion, started_at, completed_at, steps: [.steps[]? | {name, started_at, completed_at}]}");
  for (const job of jobs) {
    if (job.conclusion !== "success" || !job.started_at || !job.completed_at) continue;
    (jobDurations[job.name] ??= { job: [], build: [] }).job.push(secs(job.started_at, job.completed_at));
    const build = job.steps.find((s) => /^build|install and build/i.test(s.name));
    if (build?.started_at && build?.completed_at) jobDurations[job.name].build.push(secs(build.started_at, build.completed_at));
  }
}

// Deploy time: the job polls /health from the push, so run length ~ merge to live.
// The exact value is in each run's deploy-time artifact and step summary.
const deployRuns = runsFor("deploy-time.yml");
const deploySecs = deployRuns.filter((r) => r.conclusion === "success").map((r) => secs(r.created_at, r.updated_at));
const heartbeatRuns = runsFor("heartbeat.yml");

const result = {
  repo,
  window: { since, until },
  pullRequests: {
    total: pulls.length,
    openedInWindow: prsOpened.length,
    mergedInWindow: prsMerged.length,
    openNow: pulls.filter((p) => p.state === "open").length,
    openedByAuthor: tally(prsOpened, (p) => p.user),
  },
  reviews: {
    total: reviews.length,
    approvingTotal: approvals.length,
    inWindow: reviewsInWindow.length,
    approvingInWindow: approvalsInWindow.length,
    byReviewerInWindow: tally(reviewsInWindow, (r) => r.user),
    reviewsPerPr: pulls.length ? Math.round((reviews.length / pulls.length) * 100) / 100 : null,
    approvalsPerPr: pulls.length ? Math.round((approvals.length / pulls.length) * 100) / 100 : null,
  },
  ci: {
    runs: ciRuns.length,
    passRate: passRate(ciRuns),
    jobs: Object.fromEntries(
      Object.entries(jobDurations).map(([name, d]) => [
        name,
        { medianJobSec: median(d.job), jobRangeSec: range(d.job), medianBuildSec: median(d.build), buildRangeSec: range(d.build) },
      ]),
    ),
  },
  deploy: { runs: deployRuns.length, live: deploySecs.length, medianSec: median(deploySecs), rangeSec: range(deploySecs) },
  heartbeat: { runs: heartbeatRuns.length, passRate: passRate(heartbeatRuns) },
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  const pr = result.pullRequests;
  const rv = result.reviews;
  const pct = (p) => (p.of ? `${p.passed}/${p.of} (${p.rate}%)` : "no runs");
  console.log(`# GitHub metrics for ${repo}, ${since} to ${until}\n`);
  console.log(`vii   PRs: ${pr.total} total, ${pr.openedInWindow} opened and ${pr.mergedInWindow} merged in window, ${pr.openNow} open now`);
  console.log(`      Opened by: ${fmt(pr.openedByAuthor)}`);
  console.log(`viii  Reviews: ${rv.total} total (${rv.approvingTotal} approving), ${rv.inWindow} in window (${rv.approvingInWindow} approving)`);
  console.log(`      By reviewer: ${fmt(rv.byReviewerInWindow)}`);
  console.log(`ix    Reviews per PR: ${rv.reviewsPerPr} (approvals per PR: ${rv.approvalsPerPr})`);
  console.log(`xv    CI pass rate: ${pct(result.ci.passRate)}`);
  for (const [name, j] of Object.entries(result.ci.jobs)) {
    console.log(`v     ${name}: job median ${j.medianJobSec}s (${j.jobRangeSec?.join("-")}s), build step median ${j.medianBuildSec == null ? "-" : `${j.medianBuildSec}s`}`);
  }
  const d = result.deploy;
  console.log(`vi    Merge to live: ${d.live ? `median ${d.medianSec}s (${d.rangeSec.join("-")}s) over ${d.live} deploys` : "no deploys measured"}`);
  console.log(`iv    Heartbeat: ${pct(result.heartbeat.passRate)}`);
}
