import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanReports, publishSummary, readMetrics } from './heartbeat-summary.mjs';

const passed = {
  timestamp: '2026-11-22T12:00:00.000Z', url: 'https://heartbeat.test/', expectedMode: 'live',
  result: 'passed', httpStatus: 200, readinessLatencyMs: 250, elapsedMs: 251, error: null,
};
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'heartbeat-summary-'));
  const output = path.join(directory, 'summary.json');
  const summaryFile = path.join(directory, 'summary.md');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory, output, summaryFile,
    write(data = passed, subdir = 'run') {
      const dir = path.join(directory, subdir);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'heartbeat.json'), JSON.stringify(data));
    },
  };
}

test('publishes successful timing as JSON and a GitHub summary', (t) => {
  const f = fixture(t); f.write();
  const report = publishSummary({ ...f, testOutcome: 'success' });
  assert.equal(report.status, 'passed');
  assert.equal(JSON.parse(readFileSync(f.output)).metrics.readinessLatencyMs, 250);
  assert.match(readFileSync(f.summaryFile, 'utf8'), /\| 200 \| 250 ms \| 251 ms \|/);
});

test('publishes failure reason and elapsed time without inventing readiness latency', (t) => {
  const f = fixture(t);
  f.write({ ...passed, result: 'failed', httpStatus: 503, readinessLatencyMs: null, error: 'HTTP 503' });
  const report = publishSummary(f);
  assert.equal(report.status, 'failed');
  const markdown = readFileSync(f.summaryFile, 'utf8');
  assert.match(markdown, /Unavailable/);
  assert.match(markdown, /HTTP 503/);
});

test('failed test-step outcome overrides successful per-test metrics', (t) => {
  const f = fixture(t); f.write();
  assert.equal(publishSummary({ ...f, testOutcome: 'failure' }).status, 'failed');
});

test('missing results still produce an unavailable JSON report and summary', (t) => {
  const f = fixture(t);
  assert.equal(publishSummary(f).status, 'unavailable');
  assert.equal(JSON.parse(readFileSync(f.output)).metrics, null);
  assert.match(readFileSync(f.summaryFile, 'utf8'), /No trustworthy per-test metrics/);
});

test('malformed JSON produces an unavailable summary', (t) => {
  const f = fixture(t); f.write();
  writeFileSync(path.join(f.directory, 'run/heartbeat.json'), '{bad');
  assert.equal(publishSummary(f).status, 'unavailable');
});

test('duplicate results cannot claim success', (t) => {
  const f = fixture(t); f.write(); f.write(passed, 'duplicate');
  assert.equal(publishSummary(f).status, 'unavailable');
});

for (const [name, changes] of [
  ['negative timing', { readinessLatencyMs: -1 }],
  ['latency exceeds elapsed', { readinessLatencyMs: 1000 }],
  ['success with HTTP error', { httpStatus: 500 }],
  ['failure with latency', { result: 'failed', error: 'Failed' }],
  ['failure without reason', { result: 'failed', readinessLatencyMs: null }],
  ['invalid mode', { expectedMode: 'offline' }],
]) {
  test(`rejects ${name}`, (t) => {
    const f = fixture(t); f.write({ ...passed, ...changes });
    assert.throws(() => readMetrics(f.directory));
  });
}

test('escapes HTML and Markdown from failure text', (t) => {
  const f = fixture(t);
  f.write({ ...passed, result: 'failed', readinessLatencyMs: null, error: '<script>bad</script> | [link](https://evil.test)' });
  publishSummary(f);
  const text = readFileSync(f.summaryFile, 'utf8');
  assert.doesNotMatch(text, /<script>/);
  assert.match(text, /&lt;script&gt;/);
  assert.match(text, /\\\|/);
});

test('cleanup removes only known JSON reports and preserves failure evidence', (t) => {
  const f = fixture(t); f.write();
  writeFileSync(f.output, '{}');
  const screenshot = path.join(f.directory, 'run/screenshot.png');
  writeFileSync(screenshot, 'evidence');
  cleanReports(f.directory, f.output);
  assert.equal(existsSync(path.join(f.directory, 'run/heartbeat.json')), false);
  assert.equal(existsSync(f.output), false);
  assert.equal(existsSync(screenshot), true);
});

test('CLI returns nonzero and writes a summary if the test never started', (t) => {
  const f = fixture(t);
  const script = path.join(f.directory, 'scripts/heartbeat-summary.mjs');
  mkdirSync(path.dirname(script));
  writeFileSync(script, readFileSync(new URL('./heartbeat-summary.mjs', import.meta.url)));
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: f.summaryFile, HEARTBEAT_TEST_OUTCOME: 'failure' },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(readFileSync(f.summaryFile, 'utf8'), /unavailable/);
});
