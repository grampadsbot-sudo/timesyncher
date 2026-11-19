#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOTSTRAP_PULLS,
  applyDryRunCard,
  blockedTarget,
  bootstrapDryText,
  doorbellReasons,
  formatDry,
  planCycle,
  planPull,
  scrub,
} from './vk_ship_round_core.mjs';

const dry = process.argv.includes('--dry');
const root = process.env.TSV_DISPATCH_ROOT || path.join(process.env.HOME || '', 'tsv-dispatch');
const secrets = [process.env.GH_TOKEN, process.env.DATABASE_URL, process.env.NEON_DATABASE_URL].filter((value) => String(value || '').length > 6);

function repoDir() {
  if (process.env.TSV_REPO) return process.env.TSV_REPO;
  return fileURLToPath(new URL('../..', import.meta.url));
}

function log(line) {
  process.stdout.write(`${scrub(line, secrets)}\n`);
}

const REPO = 'grampadsbot-sudo/timesyncher';

function api(method, apiPath, data) {
  const helper = fileURLToPath(new URL('./vk_ship_github.py', import.meta.url));
  const result = spawnSync('python3', [helper, method, apiPath], {
    encoding: 'utf8',
    input: data === undefined ? undefined : JSON.stringify(data),
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = scrub(`${result.stderr || result.stdout || 'github failed'}`, secrets);
    throw new Error(detail.split('\n')[0].slice(0, 240));
  }
  if (!result.stdout) return {};
  return JSON.parse(result.stdout);
}

function titleIssue(title) {
  const match = String(title || '').match(/^#(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function bodyIssue(body) {
  const match = String(body || '').match(/Fixes #(\d+)/);
  return match ? Number(match[1]) : null;
}

function conflictOf(sha) {
  const tree = spawnSync('git', ['merge-tree', '--write-tree', '--messages', 'origin/vk', sha], { cwd: repoDir(), encoding: 'utf8' });
  const files = [];
  for (const line of `${tree.stdout}\n${tree.stderr}`.split('\n')) {
    const match = line.match(/Merge conflict in (\S+)/);
    if (match) files.push(match[1]);
  }
  const deletions = {};
  for (const file of files) {
    const left = spawnSync('git', ['diff', '--numstat', `origin/vk...${sha}`, '--', file], { cwd: repoDir(), encoding: 'utf8' }).stdout;
    const right = spawnSync('git', ['diff', '--numstat', `${sha}...origin/vk`, '--', file], { cwd: repoDir(), encoding: 'utf8' }).stdout;
    const nums = `${left}\n${right}`.split('\n').map((row) => row.split('\t')[1]).map(Number).filter((n) => Number.isFinite(n));
    deletions[file] = nums.reduce((sum, n) => sum + n, 0);
  }
  return { files: [...new Set(files)], deletions };
}

function shapePull(full) {
  const sha = full.head?.sha || full.headRefOid;
  const issue = full.closingIssuesReferences?.[0]?.number || titleIssue(full.title) || bodyIssue(full.body);
  const issueLabels = issue
    ? (api('GET', `/repos/${REPO}/issues/${issue}`).labels || []).map((label) => label.name)
    : [];
  const conflict = conflictOf(sha);
  const state = String(full.state || 'OPEN').toUpperCase();
  const dirty = full.mergeable === 'CONFLICTING' || full.mergeable_state === 'dirty' || full.mergeable === false;
  return {
    number: full.number,
    head: sha,
    headNow: sha,
    issue,
    body: full.body || '',
    prLabels: (full.labels || []).map((label) => label.name),
    issueLabels,
    state,
    merged: full.merged === true || state === 'MERGED',
    mergeableState: dirty || conflict.files.length ? 'dirty' : 'clean',
    conflictFiles: conflict.files,
    conflictDeletions: conflict.deletions,
  };
}

function loadOne(number) {
  return shapePull(api('GET', `/repos/${REPO}/pulls/${number}`));
}

function loadPulls() {
  const listed = api('GET', `/repos/${REPO}/pulls?state=open&per_page=50`);
  return (Array.isArray(listed) ? listed : []).map((pull) => loadOne(pull.number));
}

function fetchVk() {
  const helper = fileURLToPath(new URL('./vk_ship_github.py', import.meta.url));
  const result = spawnSync('git', ['-C', repoDir(), '-c', `credential.helper=!python3 ${helper} credential`, 'fetch', 'origin', 'vk'], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) throw new Error(scrub(result.stderr || result.stdout || 'fetch failed', secrets).split('\n')[0].slice(0, 240));
}

function checksFor(sha) {
  const runs = api('GET', `/repos/${REPO}/commits/${sha}/check-runs?per_page=100`);
  const status = api('GET', `/repos/${REPO}/commits/${sha}/status`);
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

function acceptanceFiles() {
  const dir = path.join(root, 'acceptance');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => [name.replace(/\.json$/, ''), true]));
}

function storyText() {
  const file = path.join(repoDir(), 'scripts/fixtures/harness/story-dry-run.json');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function worldNow(runId) {
  return {
    acceptanceFiles: acceptanceFiles(),
    tipLive: tipLive(),
    state: readState(),
    storyText: storyText(),
    databaseUrl: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '',
    runId,
  };
}

function runPy(file, args) {
  const override = file === 'tsv_dispatch.py' ? process.env.TSV_DISPATCH_BIN : process.env.TSV_LIVE_ACCEPT_BIN;
  const bin = override || path.join(root, file);
  const result = spawnSync('python3', [bin, ...args], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(scrub(result.stderr || result.stdout || file, secrets).split('\n')[0].slice(0, 240));
}

function runHarness(round, runId, sha) {
  const hit = blockedTarget(storyText()) || blockedTarget(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '');
  if (hit) {
    round.errors.push(hit);
    return;
  }
  const out = path.join(root, 'harness-runs');
  const run = spawnSync('node', ['scripts/vk-customer-harness.mjs', '--story', 'scripts/fixtures/harness/story-dry-run.json', '--run-id', runId, '--out-root', out], {
    cwd: repoDir(),
    encoding: 'utf8',
    env: process.env,
  });
  const cardPath = path.join(out, runId, 'dry-run', 'scorecard.json');
  round.dryRun = { ...round.dryRun, ran: true, sha, id: runId };
  if (!fs.existsSync(cardPath)) round.errors.push(scrub(run.stderr || 'dry-run-missing-scorecard', secrets).split('\n')[0].slice(0, 240));
  else applyDryRunCard(round, JSON.parse(fs.readFileSync(cardPath, 'utf8')));
}

async function perform(action, round) {
  if (action.type === 'add-labels') {
    api('POST', `/repos/${REPO}/issues/${action.issue}/labels`, { labels: action.labels });
    return true;
  }
  if (action.type === 'write-acceptance') {
    const file = path.join(root, 'acceptance', `${action.issue}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, `${JSON.stringify(action.spec, null, 2)}\n`);
    return true;
  }
  if (action.type === 'accept') {
    const fresh = api('GET', `/repos/${REPO}/pulls/${action.pr}`);
    if ((fresh.head?.sha || fresh.headRefOid) !== action.sha) return false;
    api('POST', `/repos/${REPO}/statuses/${action.sha}`, { state: 'success', context: 'accept', description: action.description });
    return true;
  }
  if (action.type === 'needs-rebase') {
    api('POST', `/repos/${REPO}/issues/${action.pr}/labels`, { labels: ['needs-rebase'] });
    api('POST', `/repos/${REPO}/issues/${action.pr}/comments`, { body: `needs rebase: ${action.file}` });
    return true;
  }
  if (action.type === 'merge') {
    const fresh = api('GET', `/repos/${REPO}/pulls/${action.pr}`);
    const state = String(fresh.state || '').toUpperCase();
    if ((fresh.head?.sha || fresh.headRefOid) !== action.sha || state !== 'OPEN') return false;
    api('POST', `/repos/${REPO}/pulls/${action.pr}/merge`, { merge_method: 'merge' });
    return true;
  }
  if (action.type === 'batch-deploy') {
    runPy('tsv_dispatch.py', ['--batch-deploy']);
    return true;
  }
  if (action.type === 'live-accept') {
    runPy('live_accept.py', []);
    const live = tipLive();
    round.tip = live.tip;
    round.live = live.live;
    round.tip_eq_live = Boolean(live.tip && live.tip === live.live);
    round.live_accept = live.liveAccept;
    return true;
  }
  if (action.type === 'dry-run') {
    runHarness(round, action.runId, action.sha);
    return true;
  }
  if (action.type === 'dry-run-after-deploy') {
    const live = tipLive();
    round.tip = live.tip;
    round.live = live.live;
    round.tip_eq_live = Boolean(live.tip && live.tip === live.live);
    round.live_accept = live.liveAccept;
    if (!live.tip || live.tip !== live.live || live.liveAccept !== 'pass') return false;
    if (readState().lastDrySha === live.live) return false;
    runHarness(round, action.runId, live.live);
    return true;
  }
  return false;
}

function blankRound() {
  return {
    merges: [],
    tip: tipLive().tip,
    live: tipLive().live,
    tip_eq_live: false,
    live_accept: tipLive().liveAccept,
    dryRun: { ran: false, sha: '', id: '', verdict: '', reason: '', turns: [], outputs: {}, outputsPass: false, per_customer: null, per_100: null, cleanup_remaining: null },
    needsRebase: [],
    accepts: [],
    errors: [],
    doorbell: [],
  };
}

async function runBootstrap(stamp) {
  const round = blankRound();
  let merged = 0;
  for (const item of BOOTSTRAP_PULLS) {
    try {
      fetchVk();
      const pull = loadOne(item.pr);
      pull.issue = pull.issue || item.issue;
      const world = worldNow(`dry-run-${stamp}-openrouter`);
      world.checksBySha = { [pull.head]: checksFor(pull.head) };
      const part = planPull(pull, world, item.sha);
      round.errors.push(...part.errors);
      round.needsRebase.push(...part.needsRebase);
      for (const action of part.actions) {
        const ok = await perform(action, round);
        if (action.type === 'accept' && ok) round.accepts.push({ issue: action.issue, sha: action.sha, pr: action.pr });
        if (action.type === 'merge' && ok) {
          merged += 1;
          round.merges.push(action.pr);
        }
      }
    } catch (error) {
      round.errors.push(scrub(error.message, secrets));
    }
  }
  if (merged) {
    for (const action of [
      { type: 'batch-deploy' },
      { type: 'live-accept' },
      { type: 'dry-run-after-deploy', runId: `dry-run-${stamp}-openrouter` },
    ]) {
      try { await perform(action, round); }
      catch (error) { round.errors.push(scrub(error.message, secrets)); }
    }
  }
  return round;
}

function pullOpen(number) {
  try {
    const view = api('GET', `/repos/${REPO}/pulls/${number}`);
    return String(view.state || '').toLowerCase() === 'open';
  } catch {
    return true;
  }
}

function resultPaths(stamp) {
  const dir = path.join(root, 'state', 'vk-ship-rounds');
  fs.mkdirSync(dir, { recursive: true });
  return { latest: path.join(root, 'state', 'vk-ship-round-latest.json'), archived: path.join(dir, `${stamp}.json`) };
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

function publish(round, state, stamp) {
  round.doorbell = doorbellReasons(round, state);
  const result = { at: new Date().toISOString(), ...round, doorbell: round.doorbell.length ? round.doorbell.join(',') : 'silent' };
  const paths = resultPaths(stamp);
  const body = `${JSON.stringify(result, null, 2)}\n`;
  fs.writeFileSync(paths.latest, body);
  fs.writeFileSync(paths.archived, body);
  const track = process.env.TSV_SHIP_TRACK_ISSUE || state.trackIssue;
  if (track) api('POST', `/repos/${REPO}/issues/${track}/comments`, { body });
  const next = {
    ...state,
    lastDrySha: round.dryRun.ran ? round.dryRun.sha : state.lastDrySha,
    reason: round.dryRun.ran ? round.dryRun.reason : state.reason,
    error: round.errors.join('|'),
    rebase: { ...(state.rebase || {}), ...Object.fromEntries(round.needsRebase.map((row) => [String(row.pr), row.file])) },
    bootstrapDone: state.bootstrapDone || round.merges.includes(1042),
  };
  fs.writeFileSync(statePath(), `${JSON.stringify(next, null, 2)}\n`);
  return round.doorbell;
}

async function main() {
  if (dry && process.env.TSV_SHIP_BOOTSTRAP !== '0' && (process.env.TSV_SHIP_BOOTSTRAP === '1' || !process.env.GH_TOKEN || pullOpen(1042))) {
    log(bootstrapDryText());
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (dry) {
    let pulls = [];
    try { if (process.env.GH_TOKEN) pulls = loadPulls(); }
    catch (error) { log(scrub(error.message, secrets)); return; }
    const checksBySha = {};
    for (const pull of pulls) {
      try { checksBySha[pull.head] = checksFor(pull.head); }
      catch { checksBySha[pull.head] = { checks: [], statuses: [] }; }
    }
    const planned = planCycle({ pulls, checksBySha, ...worldNow(`dry-run-${stamp}-openrouter`) });
    log(formatDry(planned.actions) || 'would stay silent');
    return;
  }
  const state = readState();
  const forced = process.env.TSV_SHIP_BOOTSTRAP === '1';
  let pulls = [];
  if (!forced) {
    try { pulls = loadPulls(); }
    catch (error) {
    const round = blankRound();
    round.errors.push(scrub(error.message, secrets));
    const reasons = publish(round, state, stamp);
    if (reasons.length) {
      try { await ring(reasons, round.errors[0] || ''); }
      catch (ringError) { log(scrub(ringError.message, secrets)); }
    }
    return;
  }
  }
  const bootstrap = forced || pulls.some((pull) => pull.number === 1042);
  const round = bootstrap
    ? await runBootstrap(stamp)
    : await runGeneral(pulls, stamp);
  const reasons = publish(round, state, stamp);
  if (reasons.length) {
    try { await ring(reasons, round.errors[0] || round.dryRun.reason || round.needsRebase.map((row) => row.file).join(',')); }
    catch (error) { log(scrub(error.message, secrets)); }
  }
}

async function runGeneral(pulls, stamp) {
  const checksBySha = {};
  for (const pull of pulls) {
    try { checksBySha[pull.head] = checksFor(pull.head); }
    catch (error) { checksBySha[pull.head] = { checks: [], statuses: [], error: scrub(error.message, secrets) }; }
  }
  const planned = planCycle({
    pulls,
    checksBySha,
    ...worldNow(`dry-run-${stamp}-openrouter`),
  });
  const round = planned.round;
  round.merges = [];
  for (const row of Object.values(checksBySha)) {
    if (row.error) round.errors.push(row.error);
  }
  let merged = 0;
  for (const action of planned.actions) {
    if (action.type === 'batch-deploy' || action.type === 'live-accept' || action.type === 'dry-run-after-deploy') continue;
    try {
      const ok = await perform(action, round);
      if (action.type === 'merge' && ok) {
        merged += 1;
        round.merges.push(action.pr);
      }
    } catch (error) {
      round.errors.push(scrub(error.message, secrets));
    }
  }
  if (merged) {
    for (const action of [
      { type: 'batch-deploy' },
      { type: 'live-accept' },
      { type: 'dry-run-after-deploy', runId: `dry-run-${stamp}-openrouter` },
    ]) {
      try { await perform(action, round); }
      catch (error) { round.errors.push(scrub(error.message, secrets)); }
    }
  } else {
    for (const action of planned.actions) {
      if (action.type !== 'dry-run') continue;
      try { await perform(action, round); }
      catch (error) { round.errors.push(scrub(error.message, secrets)); }
    }
  }
  return round;
}

main().catch((error) => {
  log(scrub(error.message, secrets));
  process.exit(1);
});
