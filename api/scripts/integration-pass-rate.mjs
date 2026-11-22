import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiDir = fileURLToPath(new URL('../', import.meta.url));
const integrationDir = path.join(apiDir, 'test/integration');

export function discoverTests(directory = integrationDir, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory()
      ? discoverTests(path.join(directory, entry.name), `${name}/`)
      : entry.isFile() && name.endsWith('.test.ts') ? [name] : [];
  });
}

export function summarizeIntegration(report, expectedFiles, testOutcome) {
  if (!report || typeof report.success !== 'boolean' || !Array.isArray(report.testResults)) {
    throw new Error('Invalid Vitest report structure.');
  }
  const expected = new Set(expectedFiles);
  const seen = new Set();
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const errors = [];
  let durationMs = 0;
  let collectedEveryFile = true;
  for (const suite of report.testResults) {
    if (typeof suite?.name !== 'string') throw new Error('Invalid test file name.');
    // Both Linux and Windows Vitest reports are supported. Unit files never
    // contribute to this metric, even though CI runs the complete API suite.
    const match = suite.name.replaceAll('\\', '/').match(/(?:^|\/)test\/integration\/(.+\.test\.ts)$/);
    if (!match) continue;
    if (!expected.has(match[1]) || seen.has(match[1]) || !Array.isArray(suite.assertionResults)) {
      throw new Error('Unexpected, duplicate, or invalid integration test file.');
    }
    seen.add(match[1]);
    if (!['passed', 'failed'].includes(suite.status)) throw new Error('Invalid suite status.');
    if (![suite.startTime, suite.endTime].every(Number.isFinite) || suite.endTime < suite.startTime) {
      throw new Error('Invalid suite duration.');
    }
    durationMs += suite.endTime - suite.startTime;
    for (const assertion of suite.assertionResults) {
      if (assertion.status === 'passed') counts.passed++;
      else if (assertion.status === 'failed') counts.failed++;
      else if (['pending', 'skipped', 'todo', 'disabled'].includes(assertion.status)) counts.skipped++;
      else throw new Error('Unknown integration test status.');
    }
    if (suite.status === 'failed') errors.push('An integration test file failed; inspect the Vitest report and CI logs.');
    if (suite.assertionResults.length === 0) {
      collectedEveryFile = false;
      errors.push('An integration test file collected no tests.');
    }
  }
  if (!expected.size) errors.push('No integration test files were discovered.');
  if (seen.size !== expected.size) errors.push('The report is missing one or more integration test files.');
  const total = counts.passed + counts.failed + counts.skipped;
  if (total === 0) errors.push('No integration tests were reported.');
  if (!report.success) errors.push('The overall API test run was unsuccessful; inspect CI logs for failures or runner errors.');
  // Vitest JSON success does not include every unhandled runner error or a
  // subsequent coverage-threshold failure. CI supplies the actual step outcome.
  if (testOutcome !== undefined && testOutcome !== 'success') {
    errors.push('The API test step did not succeed; inspect CI logs for startup, runner, or coverage errors.');
  }
  const complete = expected.size > 0 && seen.size === expected.size && total > 0 &&
    !errors.length && !counts.failed && !counts.skipped;
  return {
    status: complete ? 'passed' : 'failed', ...counts, total,
    passRate: total && seen.size === expected.size && collectedEveryFile
      ? Math.round(counts.passed / total * 10000) / 100 : null,
    durationMs: Math.round(durationMs * 100) / 100, files: seen.size, expectedFiles: expected.size,
    overallRunPassed: report.success && (testOutcome === undefined || testOutcome === 'success'), errors,
  };
}

export function writeReport({ input, outputDir, summaryFile, expectedFiles, testOutcome }) {
  let result;
  try {
    expectedFiles ??= discoverTests();
    result = summarizeIntegration(JSON.parse(readFileSync(input, 'utf8')), expectedFiles, testOutcome);
  } catch {
    result = {
      status: 'error', passed: null, failed: null, skipped: null, total: null,
      passRate: null, durationMs: null, files: null, expectedFiles: expectedFiles?.length ?? 0,
      overallRunPassed: false,
      errors: ['Integration results are unavailable: the Vitest report is missing or invalid.'],
    };
  }
  const available = result.total !== null;
  const rate = result.passRate === null ? 'Unavailable' : `${result.passRate}%`;
  const markdown = [
    '### API integration tests', '',
    '| Passed | Failed | Skipped | Total | Pass rate | Aggregate suite duration |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    available
      ? `| ${result.passed} | ${result.failed} | ${result.skipped} | ${result.total} | ${rate} | ${result.durationMs} ms |`
      : '| Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |',
    '',
    `Result: **${result.status}**. Pass rate = passed / total discovered tests; skipped tests stay in the denominator.`,
    ...result.errors.map((message) => `- ${message}`),
    '',
  ].join('\n');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'integration-pass-rate.json'), JSON.stringify(result, null, 2) + '\n');
  if (summaryFile) appendFileSync(summaryFile, markdown + '\n');
  console.log(markdown);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = writeReport({
    input: process.argv[2] ?? path.join(apiDir, 'test-results/tests.json'),
    outputDir: path.join(apiDir, 'test-results'),
    summaryFile: process.env.GITHUB_STEP_SUMMARY,
    testOutcome: process.env.API_TEST_OUTCOME,
  });
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
