import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const inputDir = fileURLToPath(new URL('../test-results/heartbeat/', import.meta.url));
const outputFile = fileURLToPath(new URL('../test-results/heartbeat-summary.json', import.meta.url));

export function resultFiles(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return entries.flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? resultFiles(filename)
      : entry.isFile() && entry.name === 'heartbeat.json' ? [filename] : [];
  });
}

export function cleanReports(directory = inputDir, summaryOutput = outputFile) {
  // Remove only known generated JSON files, preserving all source files.
  for (const filename of resultFiles(directory)) rmSync(filename, { force: true });
  rmSync(summaryOutput, { force: true });
}

export function readMetrics(directory) {
  const files = resultFiles(directory);
  if (files.length !== 1) throw new Error('Expected exactly one heartbeat result; it is missing or duplicated.');
  if (statSync(files[0]).size > 1_000_000) throw new Error('Heartbeat result exceeds the allowed size.');
  let data;
  try { data = JSON.parse(readFileSync(files[0], 'utf8')); }
  catch { throw new Error('Heartbeat result is not valid JSON.'); }
  const validNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const target = new URL(data.url);
  if (target.protocol !== 'https:' || target.username || target.password ||
      !['demo', 'live'].includes(data.expectedMode) ||
      typeof data.timestamp !== 'string' || !Number.isFinite(Date.parse(data.timestamp)) ||
      !validNumber(data.elapsedMs) ||
      (data.httpStatus !== null && (!Number.isInteger(data.httpStatus) || data.httpStatus < 100 || data.httpStatus > 599))) {
    throw new Error('Heartbeat result contains invalid metadata.');
  }
  if (data.result === 'passed') {
    if (!validNumber(data.readinessLatencyMs) || data.readinessLatencyMs > data.elapsedMs ||
        data.httpStatus < 200 || data.httpStatus >= 300 || data.error !== null) {
      throw new Error('Successful heartbeat result contains invalid timing or status.');
    }
  } else if (data.result !== 'failed' || data.readinessLatencyMs !== null ||
      typeof data.error !== 'string' || !data.error.trim()) {
    throw new Error('Failed heartbeat result must include a reason and no readiness latency.');
  }
  return data;
}

const escapeText = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replace(/[\\`*_[\]{}|]/g, '\\$&').replace(/[\r\n]+/g, ' ');

export function publishSummary({ directory = inputDir, output = outputFile, summaryFile, testOutcome } = {}) {
  let metrics = null;
  let status = 'unavailable';
  let error = null;
  try {
    metrics = readMetrics(directory);
    status = metrics.result;
    error = metrics.error;
    if (testOutcome !== undefined && testOutcome !== 'success') {
      status = 'failed';
      error = error ?? 'The heartbeat test step did not succeed; inspect the workflow log.';
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Heartbeat results could not be read.';
  }
  const report = { status, metrics, error };
  const markdown = [
    '### Production heartbeat', '', `Result: **${status}**`, '',
    ...(metrics ? [
      `Target: ${escapeText(metrics.url)}`,
      `UTC timestamp: ${escapeText(metrics.timestamp)}`,
      `Expected mode: ${escapeText(metrics.expectedMode)}`, '',
      '| HTTP status | Readiness latency | Elapsed time |',
      '| ---: | ---: | ---: |',
      `| ${metrics.httpStatus ?? 'Unavailable'} | ${metrics.readinessLatencyMs === null ? 'Unavailable' : `${metrics.readinessLatencyMs} ms`} | ${metrics.elapsedMs} ms |`,
    ] : ['No trustworthy per-test metrics are available. Check configuration, dependency installation, and browser startup in the workflow log.']),
    ...(error ? ['', `Failure reason: ${escapeText(error.slice(0, 3000))}`] : []),
    '', 'Download the production-heartbeat artifact for JSON results and any failure screenshots/traces.', '',
  ].join('\n');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  if (summaryFile) appendFileSync(summaryFile, markdown);
  console.log(markdown);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === '--clean') cleanReports();
  else {
    const report = publishSummary({
      summaryFile: process.env.GITHUB_STEP_SUMMARY,
      testOutcome: process.env.HEARTBEAT_TEST_OUTCOME,
    });
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
}
