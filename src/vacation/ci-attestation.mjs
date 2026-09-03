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

export function inspectCiAttestation({
  cwd = process.cwd(),
  env = process.env,
  sha,
  fetchRuns,
  fetchRun,
} = {}) {
  const head = sha || gitRevParse(cwd);
  const repo = githubRepoFromOrigin(cwd);
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  const receipt = readCommittedCiReceipt(cwd);
  if (
    receipt
    && receipt.sha === head
    && String(receipt.conclusion) === 'success'
    && receipt.run_id
    && receipt.workflow === 'vacation-verify'
  ) {
    return {
      ok: true,
      source: 'committed_receipt',
      sha: head,
      run_id: String(receipt.run_id),
      conclusion: 'success',
      repo,
    };
  }

  const liveId = env.GITHUB_RUN_ID || '';
  if (env.GITHUB_ACTIONS === 'true' && liveId) {
    const fetched = fetchRun
      ? { ok: true, run: fetchRun(repo, liveId, token) }
      : githubGetRun(repo, liveId, token);
    const run = fetched.run;
    const shaOk = run?.head_sha === head;
    const liveOk = run?.conclusion === 'success'
      || (run?.status === 'in_progress' && !run?.conclusion);
    if (fetched.ok && isVacationVerifyRun(run) && shaOk && liveOk && run.id) {
      return {
        ok: true,
        source: 'live_run',
        sha: head,
        run_id: String(run.id),
        conclusion: run.conclusion || 'in_progress',
        repo,
      };
    }
  }

  const listed = fetchRuns
    ? { ok: true, runs: fetchRuns(repo, head, token) || [] }
    : githubListVacationVerifyRuns(repo, head, token);
  const hit = (listed.runs || []).find((run) => (
    isVacationVerifyRun(run)
    && run.head_sha === head
    && run.conclusion === 'success'
    && run.id
  ));
  if (listed.ok && hit) {
    return {
      ok: true,
      source: 'github_api',
      sha: head,
      run_id: String(hit.id),
      conclusion: 'success',
      repo,
    };
  }

  return {
    ok: false,
    source: 'missing',
    sha: head,
    run_id: null,
    conclusion: null,
    repo,
    reason: listed.error || 'no vacation-verify success for this SHA',
  };
}
