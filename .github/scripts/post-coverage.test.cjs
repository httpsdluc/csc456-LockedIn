const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MARKER, readCoverage, renderComment, postCoverage } = require('./post-coverage.cjs');

const SHA = 'a'.repeat(40);
const metricNames = ['statements', 'branches', 'functions', 'lines'];
const summary = (percentages) => ({
  total: Object.fromEntries(metricNames.map((name, index) => [name, { pct: percentages[index] }])),
});

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lockedin-coverage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    write(name, content) {
      const target = path.join(dir, `coverage-${name}`);
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, 'coverage-summary.json'), content);
    },
  };
}

function harness(reportDir, overrides = {}) {
  const run = {
    id: 42, run_attempt: 1, head_sha: SHA, event: 'pull_request',
    status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml',
    repository: { full_name: 'team/project' }, pull_requests: [{ number: 7 }],
    ...overrides,
  };
  const calls = { created: [], updated: [], associated: 0, summary: [] };
  const pr = { state: 'open', base: { repo: { full_name: 'team/project' } }, head: { sha: SHA } };
  const comments = [];
  const listComments = () => {};
  const listAssociated = () => {};
  const github = {
    rest: {
      actions: { getWorkflowRun: async () => ({ data: run }) },
      repos: { listPullRequestsAssociatedWithCommit: listAssociated },
      pulls: { get: async () => ({ data: pr }) },
      issues: {
        listComments,
        createComment: async (input) => calls.created.push(input),
        updateComment: async (input) => calls.updated.push(input),
      },
    },
    paginate: async (method) => {
      if (method === listComments) return comments;
      assert.equal(method, listAssociated);
      calls.associated++;
      return [{ number: 7 }];
    },
  };
  const core = {
    info() {},
    summary: { addRaw(body) { calls.summary.push(body); return this; }, async write() {} },
  };
  const context = { repo: { owner: 'team', repo: 'project' }, payload: { workflow_run: { id: 42, run_attempt: 1 } } };
  return { calls, run, pr, comments, execute: () => postCoverage({ github, core, context, reportDir }) };
}

test('renders distinct API/web percentages for all four metrics', (t) => {
  const f = fixture(t);
  f.write('api', JSON.stringify(summary([99.26, 98.01, 96.77, 99.15])));
  f.write('web', JSON.stringify(summary([100, 100, 100, 100])));
  const h = harness(f.dir);
  const body = renderComment(h.run, { api: readCoverage(f.dir, 'api'), web: readCoverage(f.dir, 'web') });
  assert.match(body, /API \| 99\.26% \| 98\.01% \| 96\.77% \| 99\.15%/);
  assert.match(body, /WEB \| 100\.00% \| 100\.00% \| 100\.00% \| 100\.00%/);
  assert.match(body, /actions\/runs\/42\/attempts\/1/);
});

test('creates one bot comment, then updates it on a subsequent run', async (t) => {
  const f = fixture(t);
  f.write('api', JSON.stringify(summary([90, 90, 90, 90])));
  const h = harness(f.dir);
  await h.execute();
  assert.equal(h.calls.created.length, 1);
  h.comments.push({ id: 123, user: { login: 'github-actions[bot]', type: 'Bot' }, body: h.calls.created[0].body });
  h.run.id = 43;
  await h.execute();
  assert.equal(h.calls.created.length, 1);
  assert.equal(h.calls.updated.length, 1);
  assert.equal(h.calls.updated[0].comment_id, 123);
});

test('does not edit a human comment containing the bot marker', async (t) => {
  const h = harness(fixture(t).dir);
  h.comments.push({ id: 123, user: { login: 'contributor', type: 'User' }, body: MARKER });
  await h.execute();
  assert.equal(h.calls.updated.length, 0);
  assert.equal(h.calls.created.length, 1);
});

test('reports missing coverage on failed CI instead of preserving stale numbers', async (t) => {
  const h = harness(fixture(t).dir, { conclusion: 'failure' });
  h.comments.push({ id: 123, user: { login: 'github-actions[bot]', type: 'Bot' }, body: `${MARKER}\nold numbers` });
  await h.execute();
  assert.match(h.calls.updated[0].body, /CI result: \*\*failure\*\*/);
  assert.match(h.calls.updated[0].body, /API \| Unavailable/);
  assert.match(h.calls.updated[0].body, /WEB \| Unavailable/);
});

test('zero coverage is a valid percentage', (t) => {
  const f = fixture(t);
  f.write('api', JSON.stringify(summary([0, 0, 0, 0])));
  assert.deepEqual(readCoverage(f.dir, 'api'), [0, 0, 0, 0]);
});

for (const [name, content] of [
  ['malformed JSON', '{bad'],
  ['missing metrics', '{"total":{}}'],
  ['artifact Markdown injection', JSON.stringify(summary(['@everyone', 100, 100, 100]))],
  ['out of range', JSON.stringify(summary([101, 100, 100, 100]))],
  ['negative percentage', JSON.stringify(summary([-1, 100, 100, 100]))],
  ['oversized report', ' '.repeat(1_000_001)],
]) {
  test(`treats ${name} as unavailable`, (t) => {
    const f = fixture(t);
    f.write('api', content);
    assert.equal(readCoverage(f.dir, 'api'), null);
  });
}

test('finds a fork PR when workflow_run has no PR numbers', async (t) => {
  const h = harness(fixture(t).dir, { pull_requests: [] });
  await h.execute();
  assert.equal(h.calls.associated, 1);
  assert.equal(h.calls.created[0].issue_number, 7);
});

for (const [name, change] of [
  ['newer PR head', (h) => { h.pr.head.sha = 'b'.repeat(40); }],
  ['closed PR', (h) => { h.pr.state = 'closed'; }],
  ['different base repository', (h) => { h.pr.base.repo.full_name = 'other/repo'; }],
  ['non-PR run', (h) => { h.run.event = 'push'; }],
  ['wrong workflow path', (h) => { h.run.path = '.github/workflows/other.yml'; }],
  ['superseded attempt', (h) => { h.run.run_attempt = 2; }],
  ['unfinished run', (h) => { h.run.status = 'in_progress'; }],
  ['different run repository', (h) => { h.run.repository = { full_name: 'other/repo' }; }],
]) {
  test(`does not post for ${name}`, async (t) => {
    const h = harness(fixture(t).dir);
    change(h);
    await h.execute();
    assert.equal(h.calls.created.length, 0);
    assert.equal(h.calls.updated.length, 0);
  });
}

test('does not overwrite a newer run comment with an older run', async (t) => {
  const h = harness(fixture(t).dir);
  h.comments.push({
    id: 123, user: { login: 'github-actions[bot]', type: 'Bot' },
    body: `${MARKER}\n<!-- coverage-run:43:1 -->`,
  });
  await h.execute();
  assert.equal(h.calls.updated.length, 0);
  assert.equal(h.calls.created.length, 0);
});

test('does not overwrite a newer attempt of the same run', async (t) => {
  const h = harness(fixture(t).dir);
  h.comments.push({
    id: 123, user: { login: 'github-actions[bot]', type: 'Bot' },
    body: `${MARKER}\n<!-- coverage-run:42:2 -->`,
  });
  await h.execute();
  assert.equal(h.calls.updated.length, 0);
  assert.equal(h.calls.created.length, 0);
});
