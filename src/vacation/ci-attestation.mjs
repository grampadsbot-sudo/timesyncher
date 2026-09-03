import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const REVIEWER_CI_COMMANDS = Object.freeze([
  'node scripts/control-vacation.mjs doctor',
  'node scripts/control-vacation.mjs dry-run --all-fixtures',
  'node scripts/test_vacation_edit_pipeline.mjs',
  'node scripts/test_vacation_trek_apply.mjs',
  'node scripts/test_vacation_intake_pipeline_seam.mjs',
]);

export const CI_WORKFLOW_REL = '.github/workflows/vacation-verify.yml';
export const CI_RECEIPT_REL = 'features/proof/vac-verify-ci/receipt.json';

export function stripYamlComment(line = '') {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function unquote(value = '') {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

export function parseWorkflowRunCommands(text = '') {
  const commands = [];
  let collecting = false;
  let runIndent = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stripped = stripYamlComment(raw);
    if (collecting) {
      const indent = raw.match(/^(\s*)/)[0].length;
      const body = stripped.trim();
      if (body && indent > runIndent) {
        commands.push(body);
        continue;
      }
      if (!body && indent > runIndent) continue;
      collecting = false;
    }
    const match = stripped.match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    runIndent = match[1].length;
    const rest = match[2].trim();
    if (!rest || /^(?:[|>][-+]?)$/.test(rest)) {
      collecting = true;
      continue;
    }
    commands.push(unquote(rest));
  }
  return commands;
}

export function runCommandCovers(runLine, command) {
  const core = String(runLine || '').split(/[|>]/)[0].trim();
  return core === command || core.startsWith(`${command} `);
}

export function missingReviewerCiCommands(workflowText = '') {
  const runs = parseWorkflowRunCommands(workflowText);
  return REVIEWER_CI_COMMANDS.filter((command) => !runs.some((line) => runCommandCovers(line, command)));
}

export function gitRevParse(cwd = process.cwd(), rev = 'HEAD') {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', rev], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function githubRepoFromOrigin(cwd = process.cwd()) {
  const result = spawnSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  const url = result.stdout.trim();
  const match = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i);
  return match ? match[1] : '';
}

export function readCommittedCiReceipt(cwd = process.cwd()) {
  const filePath = path.join(cwd, CI_RECEIPT_REL);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { ok: false, reason: 'invalid_ci_receipt' };
  }
}

function githubJson(url, token = '') {
  const args = [
    '-sS',
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'User-Agent: timesyncher-vacation-verify',
  ];
  if (token) args.push('-H', `Authorization: Bearer ${token}`);
  args.push('-w', '\n%{http_code}', url);
  const result = spawnSync('curl', args, { encoding: 'utf8', timeout: 20000 });
  if (!result.stdout) return { ok: false, error: result.stderr || 'curl_failed' };
  const lines = result.stdout.replace(/\n$/, '').split('\n');
  const code = lines.pop();
  const body = lines.join('\n');
  if (code !== '200') return { ok: false, error: `http_${code}` };
  try {
    return { ok: true, json: JSON.parse(body) };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

function isVacationVerifyRun(run) {
  if (!run || typeof run !== 'object') return false;
  return run.path === CI_WORKFLOW_REL || run.name === 'vacation-verify';
}

export function githubListVacationVerifyRuns(repo, sha, token = '') {
  if (!repo || !sha) return { ok: false, runs: [], error: 'missing_repo_or_sha' };
  const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=30`;
  const fetched = githubJson(url, token);
  if (!fetched.ok) return { ok: false, runs: [], error: fetched.error };
  const runs = (fetched.json.workflow_runs || []).filter(isVacationVerifyRun);
  return { ok: true, runs };
}

export function githubGetRun(repo, runId, token = '') {
  if (!repo || !runId) return { ok: false, run: null, error: 'missing_repo_or_run' };
  const fetched = githubJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, token);
  if (!fetched.ok) return { ok: false, run: null, error: fetched.error };
  return { ok: true, run: fetched.json };
}

export function githubListJobs(repo, runId, token = '') {
  if (!repo || !runId) return { ok: false, jobs: [], error: 'missing_repo_or_run' };
  const fetched = githubJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=30`, token);
  if (!fetched.ok) return { ok: false, jobs: [], error: fetched.error };
  return { ok: true, jobs: fetched.json.jobs || [] };
}

export function githubListArtifacts(repo, runId, token = '') {
  if (!repo || !runId) return { ok: false, artifacts: [], error: 'missing_repo_or_run' };
  const fetched = githubJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts?per_page=30`, token);
  if (!fetched.ok) return { ok: false, artifacts: [], error: fetched.error };
  return { ok: true, artifacts: fetched.json.artifacts || [] };
}

export function artifactNameForSha(sha) {
  return `vacation-verify-${sha}`;
}

export function attestVacationVerifyJob({ run, jobs = [], artifacts = [], sha } = {}) {
  const fail = (reason) => ({
    ok: false,
    source: 'missing',
    sha: sha || run?.head_sha || null,
    run_id: run?.id ? String(run.id) : null,
    job_id: null,
    conclusion: null,
    artifact_digest: null,
    artifact_id: null,
    reason,
  });
  if (!isVacationVerifyRun(run) || !run?.id) return fail('not_vacation_verify_run');
  if (run.head_sha !== sha) return fail('run_sha_mismatch');
  const job = (jobs || []).find((row) => row && row.name === 'vacation-verify');
  if (!job) return fail('vacation-verify job missing');
  if (job.conclusion !== 'success') {
    return fail(`vacation-verify job conclusion=${job.conclusion || job.status || 'missing'}`);
  }
  const artifact = (artifacts || []).find((row) => (
    row
    && row.name === artifactNameForSha(sha)
    && typeof row.digest === 'string'
    && row.digest.startsWith('sha256:')
  ));
  if (!artifact) return fail('vacation-verify artifact digest missing');
  return {
    ok: true,
    sha,
    run_id: String(run.id),
    job_id: String(job.id),
    conclusion: 'success',
    artifact_digest: artifact.digest,
    artifact_id: String(artifact.id),
    repo: null,
  };
}

function loadRunJobsArtifacts(repo, runId, token, fetchJobs, fetchArtifacts) {
  const jobs = fetchJobs
    ? { ok: true, jobs: fetchJobs(repo, runId, token) || [] }
    : githubListJobs(repo, runId, token);
  const artifacts = fetchArtifacts
    ? { ok: true, artifacts: fetchArtifacts(repo, runId, token) || [] }
    : githubListArtifacts(repo, runId, token);
  return { jobs, artifacts };
}

function bindCommittedReceipt(receipt, live) {
  if (!receipt) return { ok: true };
  if (receipt.ok === false && receipt.reason === 'invalid_ci_receipt') {
    return { ok: false, reason: 'invalid_ci_receipt' };
  }
  const sameSha = receipt.sha === live.sha;
  const sameRun = String(receipt.run_id) === String(live.run_id);
  const sameDigest = receipt.artifact_digest === live.artifact_digest;
  const success = receipt.conclusion === 'success' && receipt.workflow === 'vacation-verify';
  if (!sameSha || !sameRun || !sameDigest || !success) {
    return { ok: false, reason: 'committed_receipt_does_not_match_api' };
  }
  return { ok: true };
}

export function inspectCiAttestation({
  cwd = process.cwd(),
  env = process.env,
  sha,
  receipt,
  fetchRuns,
  fetchRun,
  fetchJobs,
  fetchArtifacts,
} = {}) {
  const head = sha || gitRevParse(cwd);
  const repo = githubRepoFromOrigin(cwd);
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  const committed = receipt !== undefined ? receipt : readCommittedCiReceipt(cwd);
  const finish = (attestation, source) => {
    if (!attestation.ok) return { ...attestation, source: attestation.source || 'missing', repo };
    const bound = bindCommittedReceipt(committed, attestation);
    if (!bound.ok) {
      return {
        ok: false,
        source: 'committed_receipt',
        sha: head,
        run_id: attestation.run_id,
        job_id: attestation.job_id,
        conclusion: attestation.conclusion,
        artifact_digest: attestation.artifact_digest,
        artifact_id: attestation.artifact_id,
        repo,
        reason: bound.reason,
      };
    }
    return { ...attestation, source, repo };
  };

  const liveId = env.GITHUB_RUN_ID || '';
  if (env.GITHUB_ACTIONS === 'true' && liveId) {
    const fetched = fetchRun
      ? { ok: true, run: fetchRun(repo, liveId, token) }
      : githubGetRun(repo, liveId, token);
    if (fetched.ok && fetched.run) {
      const extras = loadRunJobsArtifacts(repo, fetched.run.id, token, fetchJobs, fetchArtifacts);
      const attested = attestVacationVerifyJob({
        run: fetched.run,
        jobs: extras.jobs.jobs,
        artifacts: extras.artifacts.artifacts,
        sha: head,
      });
      if (attested.ok) return finish(attested, 'live_run');
      if (!extras.jobs.ok || !extras.artifacts.ok) {
        return {
          ok: false,
          source: 'live_run',
          sha: head,
          run_id: String(fetched.run.id),
          job_id: null,
          conclusion: null,
          artifact_digest: null,
          repo,
          reason: extras.jobs.error || extras.artifacts.error || attested.reason,
        };
      }
    }
  }

  const listed = fetchRuns
    ? { ok: true, runs: fetchRuns(repo, head, token) || [] }
    : githubListVacationVerifyRuns(repo, head, token);
  if (!listed.ok) {
    return {
      ok: false,
      source: 'missing',
      sha: head,
      run_id: null,
      job_id: null,
      conclusion: null,
      artifact_digest: null,
      repo,
      reason: listed.error || 'github_api_failed',
    };
  }
  for (const run of listed.runs || []) {
    if (!isVacationVerifyRun(run) || run.head_sha !== head || !run.id) continue;
    const extras = loadRunJobsArtifacts(repo, run.id, token, fetchJobs, fetchArtifacts);
    if (!extras.jobs.ok || !extras.artifacts.ok) continue;
    const attested = attestVacationVerifyJob({
      run,
      jobs: extras.jobs.jobs,
      artifacts: extras.artifacts.artifacts,
      sha: head,
    });
    if (attested.ok) return finish(attested, 'github_api');
  }

  return {
    ok: false,
    source: 'missing',
    sha: head,
    run_id: null,
    job_id: null,
    conclusion: null,
    artifact_digest: null,
    repo,
    reason: 'no vacation-verify job success + artifact digest for this SHA',
  };
}
