#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMissingScorecard, dryRunId, ensureMediaBindDeployed, ensureShipRepoDeps, harnessEnvSkipped, loadStagingDatabaseUrl, markEnvBlocked } from './vk_ship_dry_env.mjs';
import { mergeOrder, mergePull, noteMergeFailure, rebaseOntoVk } from './vk_ship_merge.mjs';
import {
  BOOTSTRAP_PULLS,
  applyDryRunCard,
  blockedTarget,
  bootstrapDryText,
  doorbellReasons,
  dryRunRecorded,
  errorStateHash,
  formatDry,
  needsLiveDryRun,
  planCycle,
  planPull, rememberCustomerCost, runPyFailure,
  scrub,
  stampRound,
  tipLiveRecord,
} from './vk_ship_round_core.mjs';
import { dryRunQuotaGate, readDryRunKeyQuota } from './vk_ship_key_quota.mjs';

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

function api(method, apiPath, data, version) {
  const helper = fileURLToPath(new URL('./vk_ship_github.py', import.meta.url));
  const env = { ...process.env };
  if (version) env.TSV_GH_API_VERSION = version;
  else delete env.TSV_GH_API_VERSION;
  const result = spawnSync('python3', [helper, method, apiPath], { encoding: 'utf8', input: data === undefined ? undefined : JSON.stringify(data), env });
  if (result.status !== 0) throw new Error(scrub(`${result.stderr || result.stdout || 'github failed'}`, secrets).split('\n')[0].slice(0, 240));
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function titleIssue(title) {
  const match = String(title || '').match(/^#(\d+)\b/); return match ? Number(match[1]) : null;
}

function bodyIssue(body) {
  const match = String(body || '').match(/Fixes #(\d+)/); return match ? Number(match[1]) : null;
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
    baseRef: String(full.base?.ref || 'vk'),
    mergeableState: dirty || conflict.files.length ? 'dirty' : 'clean',
    conflictFiles: conflict.files,
    conflictDeletions: conflict.deletions,
    files: filesFor(full.number),
  };
}

function filesFor(number) {
  const files = [];
  for (let page = 1; page < 21; page += 1) {
    const list = [].concat(api('GET', `/repos/${REPO}/pulls/${number}/files?per_page=100&page=${page}`) || []);
    files.push(...list.map((row) => row.filename).filter(Boolean));
    if (list.length < 100) return files;
  }
  return null;
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

let tipCache = null;
function readTipFile() {
  const file = process.env.TSV_TIP_LIVE_FILE || path.join(root, 'state', 'tip-live.json');
  if (!fs.existsSync(file)) return { tip: '', live: '', liveAccept: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { tip: parsed.tip || '', live: parsed.live || '', liveAccept: parsed.live_accept || parsed.liveAccept || '' };
  } catch {
    return { tip: '', live: '', liveAccept: '' };
  }
}
function tipLive() {
  if (tipCache) return tipCache;
  const saved = readTipFile();
  const out = (cmd, args) => { const result = spawnSync(cmd, args, { encoding: 'utf8' }); return result.status === 0 ? result.stdout : ''; };
  const tip = process.env.TSV_TIP_SHA || out('git', ['-C', repoDir(), 'rev-parse', 'origin/vk']) || out('git', ['-C', repoDir(), 'rev-parse', 'HEAD']);
  const live = process.env.TSV_LIVE_SHA || out('python3', ['-c', 'import json,urllib.request\ntry:\n print(json.load(urllib.request.urlopen("https://vacation-staging.timesyncher.com/api/version", timeout=8)).get("sha") or "")\nexcept Exception:\n print("")']);
  tipCache = tipLiveRecord(saved, tip, live);
  return tipCache;
}
function statePath() {
  return path.join(root, 'state', 'vk-ship-round-state.json');
}
function readState() {
  const file = statePath();
  if (!fs.existsSync(file)) return { rebase: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function acceptanceDir() {
  return path.join(root, 'acceptance');
}
function acceptanceFiles() {
  const dir = acceptanceDir();
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => [name.replace(/\.json$/, ''), true]));
}
function acceptanceSpecs() {
  const dir = acceptanceDir();
  const specs = {};
  if (!fs.existsSync(dir)) return specs;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const issue = name.replace(/\.json$/, '');
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      specs[issue] = parsed && typeof parsed === 'object' ? parsed : { invalid: true };
    } catch {
      specs[issue] = { invalid: true };
    }
  }
  return specs;
}
function storyText() {
  const file = path.join(repoDir(), 'scripts/fixtures/harness/story-dry-run.json');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function worldNow(runId) {
  return {
    acceptanceFiles: acceptanceFiles(),
    acceptanceSpecs: acceptanceSpecs(),
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
  if (result.status !== 0) throw new Error(scrub(runPyFailure(file, result.status, result.stderr), secrets).slice(0, 240));
}
async function runHarness(round, runId, sha) { if (typeof runId !== 'string' || !runId) throw new Error('dry-run missing runId');
  const block = ensureShipRepoDeps({ repo: repoDir(), stateDir: path.join(root, 'state'), spawn: (cmd, args, opts) => spawnSync(cmd, args, { ...opts, encoding: 'utf8' }) });
  if (block) { round.errors.push(block); round.dryRun = markEnvBlocked(round.dryRun, sha, runId, block); return; }
  const roots = [root, process.env.TSV_REPO || '', repoDir(), path.join(root, 'ship-repo')];
  const ready = await ensureMediaBindDeployed({ env: process.env, roots, deploy: () => runPy('tsv_dispatch.py', ['--batch-deploy']) });
  const loaded = await loadStagingDatabaseUrl({ roots, env: process.env });
  const hit = blockedTarget(storyText()) || blockedTarget(loaded.url);
  if (hit || !loaded.url || ready.block) {
    if (hit) round.errors.push(hit);
    else round.dryRun = markEnvBlocked(round.dryRun, sha, runId, loaded.url ? ready.block : 'blocked: env');
    return;
  }
  if (loaded.url.length > 6) secrets.push(loaded.url); if (ready.token) secrets.push(ready.token);
  const quota = await readDryRunKeyQuota({ env: process.env, roots, fetchImpl: fetch }); if (quota.secret) secrets.push(quota.secret); const gate = dryRunQuotaGate(quota, readState().perCustomerUsd); if (gate.skip) { if (quota.block) round.errors.push(gate.reason); round.dryRun = markEnvBlocked(round.dryRun, sha, runId, gate.reason); return; }
  const out = path.join(root, 'harness-runs');
  const run = spawnSync('node', ['scripts/vk-customer-harness.mjs', '--story', 'scripts/fixtures/harness/story-dry-run.json', '--run-id', runId, '--out-root', out], { cwd: repoDir(), encoding: 'utf8', env: { ...process.env, DATABASE_URL: loaded.url, NEON_DATABASE_URL: loaded.url, TIMESYNCHER_MEDIA_BIND_TOKEN: ready.token, HARNESS_LIVE: '1' } });
  const output = scrub(`${run.stderr || ''}\n${run.stdout || ''}`, secrets);
  if (harnessEnvSkipped(output)) { round.dryRun = markEnvBlocked(round.dryRun, sha, runId); return; }
  const cardPath = path.join(out, typeof runId === 'string' && runId ? runId : (() => { throw new Error('dry-run missing runId'); })(), 'dry-run', 'scorecard.json');
  round.dryRun = { ...round.dryRun, ran: true, blockedEnv: false, sha, id: runId };
  if (!fs.existsSync(cardPath)) applyMissingScorecard(round, scrub(output, secrets));
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
  if (action.type === 'gateb-skip') {
    const gate = (api('GET', `/repos/${REPO}/commits/${action.sha}/status`).statuses || []).filter((row) => row.context === 'gateb');
    if (gate.some((row) => row.state === 'failure' || row.state === 'error')) return false;
    if (!gate.length || !gate.every((row) => row.state === 'success')) api('POST', `/repos/${REPO}/statuses/${action.sha}`, { state: 'success', context: 'gateb', description: action.description });
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
    return mergePull(action, round, {
      repo: REPO,
      getPull: (number) => api('GET', `/repos/${REPO}/pulls/${number}`),
      reportFor: (sha) => checksFor(sha),
      request: (method, apiPath, data, version) => api(method, apiPath, data, version),
      retarget: (number, base) => api('PATCH', `/repos/${REPO}/pulls/${number}`, { base }),
      rebase: (pull) => rebaseOntoVk(pull, (args) => spawnSync('git', ['-C', repoDir(), '-c', `credential.helper=!python3 ${fileURLToPath(new URL('./vk_ship_github.py', import.meta.url))} credential`, ...args], { encoding: 'utf8', env: process.env })),
      listByHead: (ref) => api('GET', `/repos/${REPO}/pulls?state=open&per_page=50&head=${encodeURIComponent(`grampadsbot-sudo:${ref}`)}`),
    });
  }
  if (action.type === 'batch-deploy') {
    const ready = await ensureMediaBindDeployed({ env: process.env, roots: [root, process.env.TSV_REPO || '', repoDir(), path.join(root, 'ship-repo')], deploy: () => runPy('tsv_dispatch.py', ['--batch-deploy']) }); if (ready.block) throw new Error(scrub(ready.block, secrets)); if (ready.token) secrets.push(ready.token); if (!ready.deployed) runPy('tsv_dispatch.py', ['--batch-deploy']);
    return true;
  }
  if (action.type === 'live-accept') {
    try { runPy('live_accept.py', ['run']); }
    catch (error) { round.live_accept = 'fail'; throw error; }
    tipCache = null;
    stampRound(round, tipLive());
    if (!round.live_accept && round.tip_eq_live) round.live_accept = 'pass';
    return true;
  }
  if (action.type === 'dry-run') {
    await runHarness(round, action.runId, action.sha);
    return true;
  }
  if (action.type === 'dry-run-after-deploy') {
    const live = tipLive();
    stampRound(round, live);
    if (!needsLiveDryRun(live, readState(), action.force === true)) return false;
    await runHarness(round, action.runId, live.live);
    return true;
  }
  return false;
}

function blankRound() {
  const round = { merges: [], tip: '', live: '', tip_eq_live: false, live_accept: '', dryRun: { ran: false, sha: '', id: '', verdict: '', reason: '', turns: [], outputs: {}, outputsPass: false, per_customer: null, per_100: null, cleanup_remaining: null, cost_unit: '', daily_cap_usd: null, daily_cap_fraction: null }, needsRebase: [], accepts: [], errors: [], heads: [], doorbell: [] };
  return stampRound(round, tipLive());
}

async function runBootstrap(stamp) {
  const round = blankRound();
  let merged = 0;
  for (const item of BOOTSTRAP_PULLS) {
    try {
      fetchVk();
      const pull = loadOne(item.pr);
      pull.issue = pull.issue || item.issue;
      if (pull.merged || pull.state === 'MERGED') continue;
      if (pull.head) round.heads.push(pull.head);
      const world = worldNow(`${stamp}`);
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
      noteMergeFailure(round, scrub(`${error.message}\n${error.stack || ''}`, secrets));
    }
  }
  const live = tipLive();
  const runId = `${stamp}`;
  const caughtUp = needsLiveDryRun(live, readState(), false);
  const tail = merged
    ? [{ type: 'batch-deploy' }, { type: 'live-accept' }, { type: 'dry-run-after-deploy', runId, force: true }]
    : (caughtUp ? [{ type: 'live-accept' }, { type: 'dry-run-after-deploy', runId }] : []);
  for (const action of tail) {
    try { await perform(action, round); }
    catch (error) { round.errors.push(scrub(`${action.type}: ${error.message}\n${error.stack || ''}`, secrets)); }
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

function ringDetail(round) {
  if (round.dryRun?.blockedEnv) return 'blocked: env';
  if (round.dryRun?.ran) return `verdict ${round.dryRun.verdict || 'FAIL'}`;
  return round.errors[0] || round.dryRun?.reason || (round.needsRebase || []).map((row) => row.file).join(',');
}
function publish(round, state, stamp) {
  stampRound(round, tipLive());
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
    lastDrySha: dryRunRecorded(round.dryRun) ? round.dryRun.sha : state.lastDrySha, perCustomerUsd: rememberCustomerCost(state.perCustomerUsd, round.dryRun),
    reason: round.dryRun?.blockedEnv ? (round.dryRun.reason || 'blocked: env') : (dryRunRecorded(round.dryRun) ? round.dryRun.reason : state.reason),
    error: round.errors.join('|'),
    errorHash: errorStateHash(round.errors, round.heads),
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
  const stamp = dryRunId();
  if (dry) {
    let pulls = [];
    try { if (process.env.GH_TOKEN) pulls = loadPulls(); }
    catch (error) { log(scrub(error.message, secrets)); return; }
    const checksBySha = {};
    for (const pull of pulls) {
      try { checksBySha[pull.head] = checksFor(pull.head); }
      catch { checksBySha[pull.head] = { checks: [], statuses: [] }; }
    }
    const planned = planCycle({ pulls, checksBySha, ...worldNow(`${stamp}`) });
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
      try { await ring(reasons, ringDetail(round)); }
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
    try { await ring(reasons, ringDetail(round)); }
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
    ...worldNow(`${stamp}`),
  });
  const round = planned.round;
  round.merges = [];
  for (const row of Object.values(checksBySha)) {
    if (row.error) round.errors.push(row.error);
  }
  let merged = 0;
  for (const action of mergeOrder(planned.actions)) {
    try {
      const ok = await perform(action, round);
      if (action.type === 'merge' && ok) {
        merged += 1;
        if (!round.merges.includes(action.pr)) round.merges.push(action.pr);
      }
    } catch (error) {
      noteMergeFailure(round, scrub(`${error.message}\n${error.stack || ''}`, secrets), action);
    }
  }
  const tail = merged
    ? [{ type: 'batch-deploy' }, { type: 'live-accept' }, { type: 'dry-run-after-deploy', runId: `${stamp}`, force: true }]
    : planned.actions.filter((action) => action.type === 'dry-run' || action.type === 'live-accept' || action.type === 'dry-run-after-deploy');
  for (const action of tail) {
    try { await perform(action, round); }
    catch (error) { round.errors.push(scrub(`${action.type}: ${error.message}\n${error.stack || ''}`, secrets)); }
  }
  return round;
}

main().catch((error) => {
  log(scrub(error.message, secrets));
  process.exit(1);
});
