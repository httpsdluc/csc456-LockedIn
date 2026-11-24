import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverTests, summarizeIntegration, writeReport } from './integration-pass-rate.mjs';

const suite = (name, statuses = ['passed'], status = statuses.includes('failed') ? 'failed' : 'passed') => ({
  name, status, startTime: 1000, endTime: 1025,
  assertionResults: statuses.map((status) => ({ status })),
});
const report = (...suites) => ({ success: !suites.some((s) => s.status === 'failed'), testResults: suites });
const filename = '/repo/api/test/integration/meals.test.ts';

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'integration-pass-rate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, input: path.join(dir, 'tests.json'), summaryFile: path.join(dir, 'summary.md') };
}

test('counts integration assertions only, not passing or failing unit tests', () => {
  const result = summarizeIntegration(report(
    suite('/repo/api/test/validation.test.ts', ['passed', 'passed']),
    suite(filename, ['passed', 'failed']),
  ), ['meals.test.ts']);
  assert.equal(result.total, 2);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.passRate, 50);
  assert.equal(result.status, 'failed');
});

test('accepts Windows paths and aggregates only integration suite durations', () => {
  const result = summarizeIntegration(report(
    suite('C:\\repo\\api\\test\\integration\\meals.test.ts'),
    suite('/repo/api/test/integration/health.test.ts'),
    suite('/repo/api/test/dates.test.ts'),
  ), ['meals.test.ts', 'health.test.ts']);
  assert.equal(result.status, 'passed');
  assert.equal(result.total, 2);
  assert.equal(result.passRate, 100);
  assert.equal(result.durationMs, 50);
});

test('keeps skipped and todo tests in the denominator and fails incomplete runs', () => {
  const result = summarizeIntegration(report(suite(filename, ['passed', 'skipped', 'todo'])), ['meals.test.ts']);
  assert.equal(result.skipped, 2);
  assert.equal(result.total, 3);
  assert.equal(result.passRate, 33.33);
  assert.equal(result.status, 'failed');
});

test('a missing integration file prevents a misleading 100% result', () => {
  const result = summarizeIntegration(report(suite(filename)), ['meals.test.ts', 'health.test.ts']);
  assert.equal(result.passRate, null);
  assert.equal(result.status, 'failed');
});

test('an import failure with zero assertions fails even if other files pass', () => {
  const result = summarizeIntegration(report(
    suite(filename), suite('/repo/api/test/integration/health.test.ts', [], 'failed'),
  ), ['meals.test.ts', 'health.test.ts']);
  assert.equal(result.status, 'failed');
  assert.equal(result.passRate, null);
});

test('zero discovered files and empty results fail without claiming 0% coverage', () => {
  const result = summarizeIntegration(report(), []);
  assert.equal(result.total, 0);
  assert.equal(result.passRate, null);
  assert.equal(result.status, 'failed');
});

test('an overall runner failure cannot produce a successful report', () => {
  const data = report(suite(filename));
  data.success = false;
  const result = summarizeIntegration(data, ['meals.test.ts']);
  assert.equal(result.passRate, 100);
  assert.equal(result.status, 'failed');
  assert.equal(result.overallRunPassed, false);
});

for (const outcome of ['failure', 'cancelled', 'skipped']) {
  test(`CI outcome ${outcome} overrides optimistic Vitest JSON`, () => {
    const result = summarizeIntegration(report(suite(filename)), ['meals.test.ts'], outcome);
    assert.equal(result.status, 'failed');
    assert.equal(result.overallRunPassed, false);
  });
}

for (const [name, data] of [
  ['invalid structure', {}],
  ['unknown status', report(suite(filename, ['unknown']))],
  ['duplicate file', report(suite(filename), suite(filename))],
  ['unexpected integration file', report(suite('/repo/api/test/integration/other.test.ts'))],
  ['invalid duration', report({ ...suite(filename), endTime: 0 })],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => summarizeIntegration(data, ['meals.test.ts']));
  });
}

test('discovers nested integration tests without including helpers', (t) => {
  const { dir } = fixture(t);
  mkdirSync(path.join(dir, 'nested'));
  writeFileSync(path.join(dir, 'meals.test.ts'), '');
  writeFileSync(path.join(dir, 'helper.ts'), '');
  writeFileSync(path.join(dir, 'nested/health.test.ts'), '');
  assert.deepEqual(discoverTests(dir).sort(), ['meals.test.ts', 'nested/health.test.ts']);
});

test('writes JSON and GitHub summary on failed tests', (t) => {
  const f = fixture(t);
  writeFileSync(f.input, JSON.stringify(report(suite(filename, ['passed', 'failed']))));
  const result = writeReport({ ...f, outputDir: f.dir, expectedFiles: ['meals.test.ts'] });
  assert.equal(result.status, 'failed');
  assert.equal(JSON.parse(readFileSync(path.join(f.dir, 'integration-pass-rate.json'))).passRate, 50);
  assert.match(readFileSync(f.summaryFile, 'utf8'), /\| 1 \| 1 \| 0 \| 2 \| 50%/);
});

for (const content of [null, '{bad JSON']) {
  test(`writes unavailable reports for ${content === null ? 'missing' : 'malformed'} input`, (t) => {
    const f = fixture(t);
    if (content !== null) writeFileSync(f.input, content);
    const result = writeReport({ ...f, outputDir: f.dir, expectedFiles: ['meals.test.ts'] });
    assert.equal(result.status, 'error');
    assert.equal(result.passRate, null);
    assert.match(readFileSync(f.summaryFile, 'utf8'), /Unavailable/);
    assert.equal(JSON.parse(readFileSync(path.join(f.dir, 'integration-pass-rate.json'))).status, 'error');
  });
}

for (const hasTestDirectory of [true, false]) {
  test(`CLI reports unavailable when ${hasTestDirectory ? 'the report' : 'the integration directory'} is missing`, (t) => {
    const f = fixture(t);
    // Use a temporary copy so CLI outputs do not overwrite real test results.
    const root = path.join(f.dir, 'api');
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    if (hasTestDirectory) {
      mkdirSync(path.join(root, 'test/integration'), { recursive: true });
      writeFileSync(path.join(root, 'test/integration/meals.test.ts'), '');
    }
    const script = path.join(root, 'scripts/integration-pass-rate.mjs');
    writeFileSync(script, readFileSync(fileURLToPath(new URL('./integration-pass-rate.mjs', import.meta.url))));
    const execution = spawnSync(process.execPath, [script], {
      encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: f.summaryFile },
    });
    assert.equal(execution.status, 1, execution.stderr);
    assert.match(readFileSync(f.summaryFile, 'utf8'), /Unavailable/);
  });
}
