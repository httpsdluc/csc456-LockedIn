const { readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const MARKER = '<!-- lockedin-pr-coverage -->';
const METRICS = ['statements', 'branches', 'functions', 'lines'];
const PACKAGES = ['api', 'web'];

function readCoverage(reportDir, packageName) {
  const filename = path.join(reportDir, `coverage-${packageName}`, 'coverage-summary.json');
  try {
    if (statSync(filename).size > 1_000_000) return null;
    const { total } = JSON.parse(readFileSync(filename, 'utf8'));
    // Never render strings, Markdown, or identifiers supplied by an artifact.
    const values = METRICS.map((metric) => total?.[metric]?.pct);
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)) {
      return null;
    }
    return values;
  } catch {
    return null;
  }
}

function renderComment(run, reports) {
  const rows = PACKAGES.map((name) => {
    const values = reports[name];
    return values
      ? `| ${name.toUpperCase()} | ${values.map((value) => `${value.toFixed(2)}%`).join(' | ')} |`
      : `| ${name.toUpperCase()} | Unavailable | Unavailable | Unavailable | Unavailable |`;
  });
  const conclusions = new Set(['success', 'failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'action_required', 'stale']);
  const conclusion = conclusions.has(run.conclusion) ? run.conclusion : 'unknown';
  return [
    MARKER,
    `<!-- coverage-run:${run.id}:${run.run_attempt} -->`,
    '## API and web coverage',
    '',
    `Commit: \`${run.head_sha.slice(0, 7)}\` · CI result: **${conclusion}**`,
    '',
    '| Package | Statements | Branches | Functions | Lines |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Unavailable means the report was missing or invalid; it does not mean 0% coverage.',
    'Coverage percentages do not establish that tests or builds passed. The CI checks remain authoritative.',
    '',
    `[View CI run](https://github.com/${run.repository.full_name}/actions/runs/${run.id}/attempts/${run.run_attempt})`,
  ].join('\n');
}

function isNewerComment(body, run) {
  const previous = body.match(/<!-- coverage-run:(\d+):(\d+) -->/);
  return previous && (Number(previous[1]) > run.id ||
    (Number(previous[1]) === run.id && Number(previous[2]) > run.run_attempt));
}

async function postCoverage({ github, context, core, reportDir }) {
  const { owner, repo } = context.repo;
  const repoName = `${owner}/${repo}`;
  const trigger = context.payload.workflow_run;
  // Resolve identity from GitHub, never from artifact-provided PR metadata.
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: trigger.id });
  if (run.event !== 'pull_request' || run.status !== 'completed' ||
      run.path !== '.github/workflows/ci.yml' || run.repository.full_name !== repoName ||
      run.run_attempt !== trigger.run_attempt || !/^[a-f0-9]{40}$/i.test(run.head_sha)) {
    core.info('Ignoring an ineligible or superseded CI run.');
    return;
  }

  let numbers = (run.pull_requests ?? []).map((pr) => pr.number);
  // workflow_run.pull_requests can be empty for fork PRs.
  if (numbers.length === 0) {
    const associated = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
      owner, repo, commit_sha: run.head_sha, per_page: 100,
    });
    numbers = associated.map((pr) => pr.number);
  }

  const reports = Object.fromEntries(PACKAGES.map((name) => [name, readCoverage(reportDir, name)]));
  const body = renderComment(run, reports);
  await core.summary.addRaw(body).write();

  for (const number of new Set(numbers)) {
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
    if (pr.state !== 'open' || pr.base.repo.full_name !== repoName || pr.head.sha !== run.head_sha) {
      core.info(`Skipping PR #${number}: closed or its head has changed.`);
      continue;
    }
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number: number, per_page: 100,
    });
    const existing = comments.find((comment) =>
      comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot' &&
      comment.body?.startsWith(MARKER));
    if (existing && isNewerComment(existing.body, run)) {
      core.info(`Skipping PR #${number}: a newer report was already posted.`);
      continue;
    }
    if (existing) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else {
      await github.rest.issues.createComment({ owner, repo, issue_number: number, body });
    }
  }
}

module.exports = { MARKER, readCoverage, renderComment, postCoverage };
