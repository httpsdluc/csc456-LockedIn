// Reads Playwright's JSON report and prints the pass rate (metric xiii).
// Usage: node scripts/pass-rate.mjs [path/to/results.json]
// Writes results/pass-rate.json and, in GitHub Actions, a step summary.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] ?? "results/results.json";
if (!existsSync(file)) {
  console.error(`No report at ${file}. Run "npm test" first.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(file, "utf8"));
const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      if (t.status === "expected") counts.passed++;
      else if (t.status === "flaky") counts.flaky++;
      else if (t.status === "skipped") counts.skipped++;
      else counts.failed++;
    }
  }
  (suite.suites ?? []).forEach(walk);
};
report.suites.forEach(walk);

const run = counts.passed + counts.failed + counts.flaky;
const passRate = run === 0 ? 0 : Math.round((counts.passed / run) * 1000) / 10;
const result = { ...counts, run, passRate, durationMs: report.stats?.duration ?? null };

writeFileSync("results/pass-rate.json", JSON.stringify(result, null, 2) + "\n");
const line = `UI tests: ${counts.passed}/${run} passed (${passRate}%), ${counts.flaky} flaky, ${counts.skipped} skipped`;
console.log(line);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
}
