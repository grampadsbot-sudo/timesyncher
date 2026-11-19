#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDryRunCard, doorbellReasons, planCycle, scrub } from './vk_ship_round_core.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const dry = process.argv.includes('--dry');
const root = process.env.TSV_DISPATCH_ROOT || path.join(process.env.HOME || '', 'tsv-dispatch');
const secrets = [process.env.GH_TOKEN, process.env.DATABASE_URL, process.env.NEON_DATABASE_URL].filter((value) => String(value || '').length > 6);

function log(line) {
  process.stdout.write(`${scrub(line, secrets)}\n`);
}

function gh(args, input) {
  const result = spawnSync('gh', args, {
    cwd: repo,
    encoding: 'utf8',
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = scrub(`${result.stderr || result.stdout || 'gh failed'}`, secrets);
    throw new Error(detail.split('\n')[0].slice(0, 240));
  }
  return result.stdout;
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function loadPulls() {
  const listed = ghJson(['pr', 'list', '--repo', 'grampadsbot-sudo/timesyncher', '--state', 'open', '--limit', '50', '--json', 'number,headRefOid,body,labels,title']);
  return listed.map((pull) => {
    const full = ghJson(['pr', 'view', String(pull.number), '--repo', 'grampadsbot-sudo/timesyncher', '--json', 'number,headRefOid,body,labels,closingIssuesReferences,mergeable']);
    const issue = full.closingIssuesReferences?.[0]?.number || null;
    const issueLabels = issue ? ghJson(['issue', 'view', String(issue), '--repo', 'grampadsbot-sudo/timesyncher', '--json', 'labels']).labels.map((label) => label.name) : [];
    const conflict = conflictOf(full.headRefOid);
    return {
      number: full.number,
      head: full.headRefOid,
      headNow: full.headRefOid,
      issue,
      body: full.body || pull.body || '',
      prLabels: (full.labels || []).map((label) => label.name),
      issueLabels,
      mergeableState: full.mergeable === 'CONFLICTING' ? 'dirty' : (conflict.files.length ? 'dirty' : 'clean'),
      conflictFiles: conflict.files,
      conflictDeletions: conflict.deletions,
    };
  });
}

function conflictOf(sha) {
  const tree = spawnSync('git', ['merge-tree', '--write-tree', '--messages', 'origin/vk', sha], { cwd: repo, encoding: 'utf8' });
  const files = [];
  for (const line of `${tree.stdout}\n${tree.stderr}`.split('\n')) {
    const match = line.match(/Merge conflict in (\S+)/);
    if (match) files.push(match[1]);
  }
  const deletions = {};
  for (const file of files) {
    const left = spawnSync('git', ['diff', '--numstat', `origin/vk...${sha}`, '--', file], { cwd: repo, encoding: 'utf8' }).stdout;
    const right = spawnSync('git', ['diff', '--numstat', `${sha}...origin/vk`, '--', file], { cwd: repo, encoding: 'utf8' }).stdout;
    const nums = `${left}\n${right}`.split('\n').map((row) => row.split('\t')[1]).map(Number).filter((n) => Number.isFinite(n));
    deletions[file] = nums.reduce((sum, n) => sum + n, 0);
  }
  return { files: [...new Set(files)], deletions };
}

function checksFor(sha) {
  const runs = ghJson(['api', `repos/grampadsbot-sudo/timesyncher/commits/${sha}/check-runs?per_page=100`]);
  const status = ghJson(['api', `repos/grampadsbot-sudo/timesyncher/commits/${sha}/status`]);
  return {
    checks: (runs.check_runs || []).map((row) => ({ name: row.name, conclusion: row.conclusion || row.status, sha })),
    statuses: (status.statuses || []).map((row) => ({ context: row.context, state: row.state, sha })),
  };
}

function tipLive() {
  const file = process.env.TSV_TIP_LIVE_FILE || path.join(root, 'state', 'tip-live.json');
  if (!fs.existsSync(file)) return { tip: '', live: '', liveAccept: '' };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { tip: parsed.tip || '', live: parsed.live || '', liveAccept: parsed.live_accept || parsed.liveAccept || '' };
}

function statePath() {
  return path.join(root, 'state', 'vk-ship-round-state.json');
}

function readState() {
  const file = statePath();
  if (!fs.existsSync(file)) return { rebase: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resultPath(stamp) {
  const dir = path.join(root, 'state', 'vk-ship-rounds');
  fs.mkdirSync(dir, { recursive: true });
  const latest = path.join(root, 'state', 'vk-ship-round-latest.json');
  const archived = path.join(dir, `${stamp}.json`);
  return { latest, archived };
}

async function ring(reasons, detail) {
  const secPath = path.join(root, '.drEgg-doorbell.json');
  if (!fs.existsSync(secPath)) throw new Error('doorbell-missing');
  const sec = JSON.parse(fs.readFileSync(secPath, 'utf8'));
  const body = {
    kind: 'vk-ship-round',
    reason: reasons.join(','),
    detail: scrub(detail, secrets).slice(0, 500),
    job_id: `vk-ship-${reasons[0]}-${new Date().toISOString().slice(0, 16).replace(/\W/g, '')}`,
    created_at: new Date().toISOString(),
  };
  const response = await fetch(sec.webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${sec.webhookBearer}`,
      'x-automation-key': sec.webhookBearer,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return response.status;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const state = dry ? {} : readState();
  let pulls = [];
  let errors = [];
  try {
    if (!dry || process.env.GH_TOKEN) pulls = loadPulls();
  } catch (error) {
    errors.push(scrub(error.message, secrets));
  }
  const checksBySha = {};
  if (!dry) {
    for (const pull of pulls) {
      try { checksBySha[pull.head] = checksFor(pull.head); }
      catch (error) { errors.push(scrub(error.message, secrets)); }
    }
  }
  const storyPath = path.join(repo, 'scripts/fixtures/harness/story-dry-run.json');
  const planned = planCycle({
    pulls,
    checksBySha,
    acceptanceFiles: Object.fromEntries(fs.existsSync(path.join(root, 'acceptance')) ? fs.readdirSync(path.join(root, 'acceptance')).filter((name) => name.endsWith('.json')).map((name) => [name.replace(/\.json$/, ''), true]) : []),
    tipLive: tipLive(),
    state,
    storyText: fs.existsSync(storyPath) ? fs.readFileSync(storyPath, 'utf8') : '',
    databaseUrl: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '',
    merges: state.merged || [],
    runId: `dry-run-${stamp}-openrouter`,
  });
  planned.round.errors.push(...errors);
  planned.round.doorbell = doorbellReasons(planned.round, state);
  if (dry) {
    for (const action of planned.actions) log(`would ${action.type} ${action.issue || action.pr || action.sha || ''}`);
    if (planned.round.doorbell.length) log(`would doorbell ${planned.round.doorbell.join(',')}`);
    else log('would stay silent');
    return;
  }
  for (const action of planned.actions) {
    try {
      if (action.type === 'add-labels') gh(['issue', 'edit', String(action.issue), '--repo', 'grampadsbot-sudo/timesyncher', '--add-label', action.labels.join(',')]);
      if (action.type === 'write-acceptance') {
        const file = path.join(root, 'acceptance', `${action.issue}.json`);
        if (!fs.existsSync(file)) fs.writeFileSync(file, `${JSON.stringify(action.spec, null, 2)}\n`);
      }
      if (action.type === 'accept') {
        const fresh = ghJson(['pr', 'view', String(action.pr), '--repo', 'grampadsbot-sudo/timesyncher', '--json', 'headRefOid']);
        if (fresh.headRefOid !== action.sha) continue;
        gh(['api', `repos/grampadsbot-sudo/timesyncher/statuses/${action.sha}`, '-f', 'state=success', '-f', 'context=accept', '-f', `description=${action.description}`]);
      }
      if (action.type === 'needs-rebase') {
        gh(['pr', 'edit', String(action.pr), '--repo', 'grampadsbot-sudo/timesyncher', '--add-label', 'needs-rebase']);
        gh(['pr', 'comment', String(action.pr), '--repo', 'grampadsbot-sudo/timesyncher', '--body', `needs rebase: ${action.file}`]);
      }
      if (action.type === 'dry-run') {
        const out = path.join(root, 'harness-runs');
        const run = spawnSync('node', ['scripts/vk-customer-harness.mjs', '--story', 'scripts/fixtures/harness/story-dry-run.json', '--run-id', action.runId, '--out-root', out], { cwd: repo, encoding: 'utf8', env: process.env });
        const cardPath = path.join(out, action.runId, 'dry-run', 'scorecard.json');
        if (!fs.existsSync(cardPath)) planned.round.errors.push(scrub(run.stderr || 'dry-run-missing-scorecard', secrets).split('\n')[0].slice(0, 240));
        else applyDryRunCard(planned.round, JSON.parse(fs.readFileSync(cardPath, 'utf8')));
      }
    } catch (error) {
      planned.round.errors.push(scrub(error.message, secrets));
    }
  }
  planned.round.doorbell = doorbellReasons(planned.round, state);
  const result = { at: new Date().toISOString(), ...planned.round, doorbell: planned.round.doorbell.length ? planned.round.doorbell.join(',') : 'silent' };
  const paths = resultPath(stamp);
  const body = `${JSON.stringify(result, null, 2)}\n`;
  fs.writeFileSync(paths.latest, body);
  fs.writeFileSync(paths.archived, body);
  const track = process.env.TSV_SHIP_TRACK_ISSUE || state.trackIssue;
  if (track) gh(['issue', 'comment', String(track), '--repo', 'grampadsbot-sudo/timesyncher', '--body', body]);
  if (planned.round.doorbell.length) {
    try { await ring(planned.round.doorbell, planned.round.errors[0] || planned.round.dryRun.reason || planned.round.needsRebase.map((row) => row.file).join(',')); }
    catch (error) { log(`doorbell ${scrub(error.message, secrets)}`); }
  }
  const next = {
    ...state,
    lastDrySha: planned.round.dryRun.ran ? planned.round.dryRun.sha : state.lastDrySha,
    reason: planned.round.dryRun.ran ? planned.round.dryRun.reason : state.reason,
    error: planned.round.errors.join('|'),
    rebase: { ...(state.rebase || {}), ...Object.fromEntries(planned.round.needsRebase.map((row) => [String(row.pr), row.file])) },
  };
  fs.writeFileSync(statePath(), `${JSON.stringify(next, null, 2)}\n`);
}

main().catch((error) => {
  log(scrub(error.message, secrets));
  process.exit(1);
});
