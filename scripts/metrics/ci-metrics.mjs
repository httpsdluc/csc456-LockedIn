#!/usr/bin/env node
// Collects the sprint report's CI and deploy metrics from GitHub Actions:
//   v   Backend build time  (median and range of each CI job and its build step)
//   vi  Build to deployment (merge-to-live seconds from the Deploy time workflow)
//   iv  Heartbeat pass rate (from the Production heartbeat workflow, once it exists)
//   xv  CI pass rate
// PR and review counts (vii, viii, ix) live in github_metrics.py.
//
// Usage:
//   node scripts/metrics/ci-metrics.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repo owner/name] [--json]
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

const runsFor = (file) => {
  try {
    return ghLines(
      `repos/${repo}/actions/workflows/${file}/runs?per_page=100&created=${since}..${until}`,
      ".workflow_runs[] | {id, status, conclusion, created_at, updated_at}",
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

// --- CI: pass rate and job/build durations (v, xv) ---
const ciRuns = runsFor("ci.yml");
const jobDurations = {};
for (const run of ciRuns) {
  const jobs = ghLines(
    `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
    ".jobs[] | {name, conclusion, started_at, completed_at, steps: [.steps[]? | {name, started_at, completed_at}]}",
  );
  for (const job of jobs) {
    if (job.conclusion !== "success" || !job.started_at || !job.completed_at) continue;
    const d = (jobDurations[job.name] ??= { job: [], build: [] });
    d.job.push(secs(job.started_at, job.completed_at));
    const build = job.steps.find((s) => /^build|install and build/i.test(s.name));
    if (build?.started_at && build?.completed_at) d.build.push(secs(build.started_at, build.completed_at));
  }
}

// --- Deploy time (vi): the job polls /health from the push, so run length ~ merge to live.
// The exact value is in each run's deploy-time artifact and step summary.
const deployRuns = runsFor("deploy-time.yml");
const deploySecs = deployRuns.filter((r) => r.conclusion === "success").map((r) => secs(r.created_at, r.updated_at));

// --- Heartbeat (iv): Atif's scheduled production run (#48).
const heartbeatRuns = runsFor("production-heartbeat.yml");

const result = {
  repo,
  window: { since, until },
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
  const pct = (p) => (p.of ? `${p.passed}/${p.of} (${p.rate}%)` : "no runs");
  console.log(`# CI and deploy metrics for ${repo}, ${since} to ${until}\n`);
  console.log(`xv  CI pass rate: ${pct(result.ci.passRate)}`);
  for (const [name, j] of Object.entries(result.ci.jobs)) {
    const build = j.medianBuildSec == null ? "-" : `${j.medianBuildSec}s`;
    console.log(`v   ${name}: job median ${j.medianJobSec}s (${j.jobRangeSec.join("-")}s), build step median ${build}`);
  }
  const d = result.deploy;
  console.log(`vi  Merge to live: ${d.live ? `median ${d.medianSec}s (${d.rangeSec.join("-")}s) over ${d.live} deploys` : "no deploys measured"}`);
  console.log(`iv  Heartbeat: ${pct(result.heartbeat.passRate)}`);
}
