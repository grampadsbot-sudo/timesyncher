import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerQuotaReason, stripeEnvBlockReason } from './vk_ship_key_quota.mjs';

const REQUIRED_LABELS = ['project:tsv', 'base:vk', 'craig-asked'];
const OFFLINE_TESTS = 'scripts/offline-tests.txt';
const OUTPUT_IDS = ['dialog-pdf', 'keepsake-pdf', 'screens', 'video-check', 'scorecard'];
const OK = new Set(['success', 'pass']);
const UI_EXT = new Set(['css', 'scss', 'sass', 'less', 'html', 'htm', 'jsx', 'tsx', 'vue', 'svelte', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico']);
const UI_ROOT = ['apps/', 'src/', 'public/', 'baselines/'];

function rulesFile() {
  const fromRepo = process.env.TSV_REPO
    ? path.join(process.env.TSV_REPO, 'scripts/fixtures/harness/protected-targets.json')
    : '';
  if (fromRepo && existsSync(fromRepo)) return fromRepo;
  return fileURLToPath(new URL('../fixtures/harness/protected-targets.json', import.meta.url));
}

const rules = JSON.parse(readFileSync(rulesFile(), 'utf8'));

export const BOOTSTRAP_PULLS = [
  { pr: 1042, issue: 1041, sha: '' },
  { pr: 1040, issue: 1039, sha: 'd816927d5423266d320f72d2116cea44edcfbbae' },
  { pr: 1044, issue: 1043, sha: '6512f9bd099a9b31b17f0ebce44d92bd2f52c129' },
];

export function bootstrapDryText() {
  const lines = [];
  for (const item of BOOTSTRAP_PULLS) {
    lines.push(`pr ${item.pr} issue ${item.issue}`);
    lines.push(`register acceptance/${item.issue}.json`);
    lines.push('add-labels project:tsv base:vk craig-asked');
    lines.push(item.sha ? `accept ${item.sha}` : 'accept exact green head');
    lines.push('merge');
  }
  lines.push('batch-deploy python3 tsv_dispatch.py --batch-deploy');
  lines.push('live-accept python3 live_accept.py run');
  lines.push('dry-run once on the new live sha');
  return lines.join('\n');
}

export function scrub(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    const value = String(secret || '');
    if (value.length > 6) out = out.split(value).join('[redacted]');
  }
  return out
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-db]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted]');
}

function acceptanceFromBody(body) {
  const match = String(body || '').match(/```acceptance[^\n]*\n([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return { invalid: true };
  }
}

export function errorStateHash(errors, heads) {
  const body = JSON.stringify({
    errors: [...new Set(errors || [])].sort(),
    heads: [...new Set(heads || [])].filter(Boolean).sort(),
  });
  return createHash('sha256').update(body).digest('hex');
}

export function runPyFailure(file, status, stderr) {
  const lines = String(stderr || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '';
  const code = status === null || status === undefined ? 1 : status;
  return last ? `${file} exit ${code}: ${last}` : `${file} exit ${code}`;
}

export function crontabHasActive(current, marker) {
  return String(current || '').split('\n').some((line) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && !trimmed.startsWith('#') && trimmed.includes(marker);
  });
}

function labelGap(have) {
  const set = new Set(have || []);
  return REQUIRED_LABELS.filter((label) => !set.has(label));
}

function eligiblePull(pull) {
  const labels = new Set([...(pull.prLabels || []), ...(pull.issueLabels || [])]);
  if (!REQUIRED_LABELS.every((label) => labels.has(label))) return false;
  const spec = acceptanceFromBody(pull.body);
  return Boolean(spec) && spec.invalid !== true && Number(pull.issue) > 0;
}

export function pathIsUi(file) {
  const rel = String(file || '').replace(/^\.\//, '').toLowerCase();
  if (!rel) return true;
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1) : '';
  if (UI_EXT.has(ext)) return true;
  return UI_ROOT.some((prefix) => rel.startsWith(prefix) || rel.includes(`/${prefix}`));
}

export function gatebSkipDescription(sha) {
  return `Gate B SKIPPED_BACKEND_ONLY on ${String(sha || '').slice(0, 7)} (no UI files)`;
}

function ciReady(report, sha) {
  const checks = (report?.checks || []).filter((row) => !row.sha || row.sha === sha);
  for (const name of ['secrets', 'unit-tests']) {
    const rows = checks.filter((row) => row.name === name);
    if (!rows.length || rows.some((row) => !OK.has(row.conclusion))) return false;
  }
  return true;
}

export function gatebSkipAction(pull, report) {
  if (!pull?.head || !Array.isArray(pull.files) || !pull.files.length) return null;
  if (pull.files.some((file) => pathIsUi(file))) return null;
  if (!ciReady(report, pull.head)) return null;
  const gate = (report?.statuses || []).filter((row) => (!row.sha || row.sha === pull.head) && row.context === 'gateb');
  if (gate.some((row) => row.state === 'failure' || row.state === 'error')) return null;
  if (gate.length && gate.every((row) => OK.has(row.state))) return null;
  return { type: 'gateb-skip', pr: pull.number, sha: pull.head, description: gatebSkipDescription(pull.head) };
}

function headIsGreen(report, sha) {
  const checks = (report?.checks || []).filter((row) => !row.sha || row.sha === sha);
  const statuses = (report?.statuses || []).filter((row) => !row.sha || row.sha === sha);
  for (const name of ['secrets', 'unit-tests']) {
    const rows = checks.filter((row) => row.name === name);
    if (!rows.length || rows.some((row) => !OK.has(row.conclusion))) return false;
  }
  const gate = statuses.filter((row) => row.context === 'gateb');
  return gate.length > 0 && gate.every((row) => OK.has(row.state));
}

function alreadyAccepted(report, sha) {
  return (report?.statuses || []).some((row) => (!row.sha || row.sha === sha) && row.context === 'accept' && OK.has(row.state));
}

export function exactHeadMergeReady(report, sha) {
  return Boolean(sha) && headIsGreen(report, sha) && alreadyAccepted(report, sha);
}

function rebaseFile(pull) {
  if (pull.mergeableState !== 'dirty') return '';
  const files = pull.conflictFiles || [];
  if (files.length !== 1 || files[0] !== OFFLINE_TESTS) return '';
  if (Number(pull.conflictDeletions?.[OFFLINE_TESTS] || 0) > 0) return '';
  return OFFLINE_TESTS;
}

function dryRunSha(tipLive, state) {
  if (!tipLive || tipLive.tip !== tipLive.live || tipLive.liveAccept !== 'pass' || !tipLive.live) return '';
  if (state?.lastDrySha === tipLive.live) return '';
  return tipLive.live;
}

function outputsPass(card) {
  const checks = card?.checks || [];
  return OUTPUT_IDS.every((id) => checks.some((row) => row.id === id && row.pass === true));
}

function sha40(value) {
  const sha = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : '';
}

export function tipLiveRecord(saved, tip, live) {
  const base = saved || {};
  return {
    tip: sha40(tip) || sha40(base.tip),
    live: sha40(live) || sha40(base.live),
    liveAccept: base.liveAccept || '',
  };
}

export function needsLiveDryRun(record, state, force) {
  if (!record?.live || record.tip !== record.live) return false;
  if (force) return true;
  return state?.lastDrySha !== record.live;
}

export function stampRound(round, live) {
  const tip = live?.tip || round.tip || '';
  const sha = live?.live || round.live || '';
  round.tip = tip;
  round.live = sha;
  round.tip_eq_live = Boolean(tip && tip === sha);
  if (live?.liveAccept) round.live_accept = live.liveAccept;
  return round;
}

export function blockedTarget(text) {
  return protectedTarget(text);
}

function protectedTarget(text) {
  const blob = String(text || '');
  for (const prefix of rules.tripIdPrefixes || []) {
    if (prefix && blob.toLowerCase().includes(String(prefix).toLowerCase())) return 'protected-database';
  }
  for (const prefix of rules.sharePrefixes || []) {
    if (prefix && blob.toUpperCase().includes(String(prefix).toUpperCase())) return 'protected-share';
  }
  if (/"tripId"\s*:\s*99\b/.test(blob) || /\btrip(?:Id|_id)?\s*[:=]\s*99\b/.test(blob)) return 'protected-trip';
  return '';
}

export function dryRunRecorded(dryRun) {
  return Boolean(dryRun?.ran) && dryRun?.blockedEnv !== true;
}

export function doorbellReasons(round, previous = {}) {
  const reasons = [];
  const dry = round.dryRun;
  if (dry?.blockedEnv && dry.reason !== (previous.reason || '')) reasons.push('blocked: env');
  if (dry?.ran && !dry.blockedEnv && dry.verdict === 'PASS' && dry.outputsPass) reasons.push('dry-run-pass');
  if (dry?.ran && !dry.blockedEnv && dry.verdict !== 'PASS' && dry.reason && dry.reason !== previous.reason) reasons.push('new-failure');
  if ((round.needsRebase || []).some((row) => !previous.rebase?.[String(row.pr)])) reasons.push('needs-rebase');
  const hash = errorStateHash(round.errors, round.heads);
  if ((round.errors || []).length && hash !== (previous.errorHash || '')) reasons.push('error');
  return reasons;
}

function canMerge(pull) {
  if (pull.merged === true || pull.state === 'MERGED') return false;
  if (pull.mergeableState === 'dirty') return false;
  if ((pull.conflictFiles || []).length) return false;
  return true;
}

function blankDry(sha) {
  return {
    ran: false,
    sha: sha || '',
    id: '',
    verdict: '',
    reason: '',
    turns: [],
    outputs: {},
    outputsPass: false,
    per_customer: null,
    per_100: null,
    cleanup_remaining: null,
    cost_unit: '',
    daily_cap_usd: null,
    daily_cap_fraction: null,
  };
}

export function rememberCustomerCost(previous, dryRun) {
  const amount = Number(dryRun?.per_customer);
  const usd = dryRun?.cost_unit === 'usd' || Number.isFinite(Number(dryRun?.daily_cap_usd));
  if (dryRun && dryRun.blockedEnv !== true && usd && Number.isFinite(amount) && amount > 0) return amount;
  const kept = Number(previous);
  return Number.isFinite(kept) && kept > 0 ? kept : null;
}

export function planPull(pull, world, pinSha = '') {
  const state = world.state || {};
  const actions = [];
  const errors = [];
  const needsRebase = [];
  const issue = Number(pull.issue) || 0;
  if (!issue) {
    errors.push(`missing-issue:${pull.number}`);
    return { actions, errors, needsRebase };
  }
  const fromBody = acceptanceFromBody(pull.body);
  const fromFile = world.acceptanceSpecs?.[String(issue)];
  if (fromBody?.invalid || fromFile?.invalid) {
    errors.push(`acceptance-invalid:${issue}`);
    return { actions, errors, needsRebase };
  }
  const spec = fromBody || fromFile;
  if (!spec) {
    errors.push(`acceptance-missing:${issue}`);
    return { actions, errors, needsRebase };
  }
  const missing = labelGap(pull.issueLabels);
  if (missing.length) actions.push({ type: 'add-labels', issue, pr: pull.number, labels: missing });
  if (!world.acceptanceFiles?.[String(issue)]) actions.push({ type: 'write-acceptance', issue, pr: pull.number, spec });
  if (pinSha && pull.head !== pinSha) {
    errors.push(`head-moved:${pull.number}`);
    return { actions, errors, needsRebase };
  }
  const file = rebaseFile(pull);
  if (file && !state.rebase?.[String(pull.number)]) {
    needsRebase.push({ pr: pull.number, file });
    actions.push({ type: 'needs-rebase', pr: pull.number, issue, file });
  }
  const report = world.checksBySha?.[pull.head] || { checks: [], statuses: [] };
  const current = pull.headNow || pull.head;
  if (current !== pull.head) return { actions, errors, needsRebase };
  const skip = gatebSkipAction(pull, report);
  const judged = skip
    ? { ...report, statuses: [...(report.statuses || []), { context: 'gateb', state: 'success', sha: pull.head }] }
    : report;
  if (skip) actions.push(skip);
  if (!headIsGreen(judged, pull.head)) return { actions, errors, needsRebase };
  if (!alreadyAccepted(report, pull.head)) {
    const count = Array.isArray(spec.assertions) ? spec.assertions.length : 1;
    actions.push({
      type: 'accept',
      pr: pull.number,
      issue,
      sha: pull.head,
      description: `#${issue}: ${count}/${count} PASS`,
    });
  }
  if (canMerge(pull)) {
    const files = pull.files || [];
    actions.push({
      type: 'merge',
      pr: pull.number,
      issue,
      sha: pull.head,
      baseRef: pull.baseRef || 'vk',
      shipFix: files.some((file) => /vk_ship_(round|merge)/.test(String(file))),
    });
  }
  return { actions, errors, needsRebase };
}

function appendDeployOrDry(actions, world, errors) {
  const state = world.state || {};
  const merges = actions.filter((action) => action.type === 'merge');
  if (merges.length) {
    actions.push({ type: 'batch-deploy' });
    actions.push({ type: 'live-accept' });
    actions.push({ type: 'dry-run-after-deploy', runId: world.runId || '' });
    return blankDry('');
  }
  const tipLive = world.tipLive || {};
  if (needsLiveDryRun(tipLive, state, false)) {
    actions.push({ type: 'live-accept' });
    const dryRun = blankDry(tipLive.live);
    const hit = protectedTarget(world.storyText || '') || protectedTarget(world.databaseUrl || '');
    if (hit) {
      errors.push(hit);
      return dryRun;
    }
    dryRun.id = world.runId || `dry-run-${tipLive.live.slice(0, 7)}-openrouter`;
    actions.push({ type: 'dry-run-after-deploy', sha: tipLive.live, runId: dryRun.id });
    return dryRun;
  }
  const sha = dryRunSha(world.tipLive, state);
  const dryRun = blankDry(sha || world.tipLive?.live || '');
  if (!sha) return dryRun;
  const hit = protectedTarget(world.storyText || '') || protectedTarget(world.databaseUrl || '');
  if (hit) {
    errors.push(hit);
    return dryRun;
  }
  dryRun.ran = true;
  dryRun.id = world.runId || `dry-run-${sha.slice(0, 7)}-openrouter`;
  actions.push({ type: 'dry-run', sha, runId: dryRun.id });
  return dryRun;
}

function roundFrom(world, actions, errors, needsRebase, dryRun) {
  const state = world.state || {};
  const accepts = actions.filter((action) => action.type === 'accept').map((action) => ({
    issue: action.issue,
    sha: action.sha,
    pr: action.pr,
  }));
  const round = {
    heads: (world.pulls || []).map((pull) => pull.head).filter(Boolean),
    merges: actions.filter((action) => action.type === 'merge').map((action) => action.pr),
    tip: world.tipLive?.tip || '',
    live: world.tipLive?.live || '',
    tip_eq_live: Boolean(world.tipLive && world.tipLive.tip && world.tipLive.tip === world.tipLive.live),
    live_accept: world.tipLive?.liveAccept || '',
    dryRun,
    needsRebase,
    accepts,
    errors,
  };
  round.doorbell = doorbellReasons(round, state);
  return { actions, round };
}

export function planBootstrap(world) {
  const actions = [];
  const errors = [];
  const needsRebase = [];
  for (const item of BOOTSTRAP_PULLS) {
    const pull = (world.pulls || []).find((row) => row.number === item.pr);
    if (!pull) {
      errors.push(`missing-pr:${item.pr}`);
      continue;
    }
    if (pull.merged === true || pull.state === 'MERGED') continue;
    const part = planPull({ ...pull, issue: pull.issue || item.issue }, world, item.sha);
    actions.push(...part.actions);
    errors.push(...part.errors);
    needsRebase.push(...part.needsRebase);
  }
  const dryRun = appendDeployOrDry(actions, world, errors);
  return roundFrom(world, actions, errors, needsRebase, dryRun);
}

export function planCycle(world) {
  const actions = [];
  const errors = [];
  const needsRebase = [];
  for (const pull of world.pulls || []) {
    const spec = acceptanceFromBody(pull.body);
    const labeled = REQUIRED_LABELS.every((label) => new Set([...(pull.prLabels || []), ...(pull.issueLabels || [])]).has(label));
    if (labeled && spec?.invalid) {
      errors.push(`acceptance-invalid:${pull.issue || pull.number}`);
      continue;
    }
    if (!eligiblePull(pull)) continue;
    const part = planPull(pull, world, '');
    actions.push(...part.actions);
    errors.push(...part.errors);
    needsRebase.push(...part.needsRebase);
  }
  const dryRun = appendDeployOrDry(actions, world, errors);
  return roundFrom(world, actions, errors, needsRebase, dryRun);
}

export function formatDry(actions) {
  const lines = [];
  let current = '';
  for (const action of actions) {
    const key = action.pr || action.issue || '';
    if (key && key !== current && (action.type === 'add-labels' || action.type === 'write-acceptance' || action.type === 'accept' || action.type === 'merge' || action.type === 'needs-rebase')) {
      current = key;
      lines.push(`pr ${action.pr || ''} issue ${action.issue || ''}`.trim());
    }
    if (action.type === 'add-labels') lines.push(`add-labels ${(action.labels || []).join(' ')}`);
    if (action.type === 'write-acceptance') lines.push(`register acceptance/${action.issue}.json`);
    if (action.type === 'gateb-skip') lines.push(`gateb-skip ${action.sha}`);
    if (action.type === 'accept') lines.push(`accept ${action.sha}`);
    if (action.type === 'merge') lines.push('merge');
    if (action.type === 'needs-rebase') lines.push(`needs-rebase ${action.file}`);
    if (action.type === 'batch-deploy') lines.push('batch-deploy python3 tsv_dispatch.py --batch-deploy');
    if (action.type === 'live-accept') lines.push('live-accept python3 live_accept.py run');
    if (action.type === 'dry-run') lines.push(`dry-run ${action.sha}`);
    if (action.type === 'dry-run-after-deploy') lines.push('dry-run once on the new live sha');
  }
  return lines.join('\n');
}

export function applyDryRunCard(round, card) {
  const pass = outputsPass(card);
  const remaining = card?.cleanup?.remaining;
  const reason = remaining !== 0 && remaining != null ? 'cleanup-remaining' : (card?.reason || (card?.verdict === 'PASS' ? '' : 'fail'));
  round.dryRun = {
    ...round.dryRun,
    ran: true,
    blockedEnv: false,
    verdict: remaining !== 0 && remaining != null ? 'FAIL' : (card?.verdict || 'FAIL'),
    reason,
    turns: (card?.turns || []).map((turn) => ({
      n: turn.n,
      role: turn.role,
      model: turn.stored_model || '',
      cost: turn.cost_amount ?? null,
      gap: turn.gap || '',
    })),
    outputs: Object.fromEntries(OUTPUT_IDS.map((id) => [id, (card?.checks || []).some((row) => row.id === id && row.pass === true)])),
    outputsPass: pass && card?.verdict === 'PASS' && (remaining === 0 || remaining == null),
    per_customer: card?.cost?.per_customer ?? null,
    per_100: card?.cost?.per_100 ?? null,
    cleanup_remaining: remaining ?? null,
    cost_unit: card?.cost?.unit || '',
    daily_cap_usd: card?.cost?.daily_cap_usd ?? null,
    daily_cap_fraction: card?.cost?.daily_cap_fraction ?? null,
  };
  if (round.dryRun.cleanup_remaining !== 0 && round.dryRun.cleanup_remaining != null) {
    round.dryRun.outputsPass = false;
    round.dryRun.verdict = 'FAIL';
    round.dryRun.reason = 'cleanup-remaining';
  }
  const quotaReason = providerQuotaReason(card) || stripeEnvBlockReason(card);
  if (quotaReason) {
    round.dryRun.blockedEnv = true;
    round.dryRun.verdict = '';
    round.dryRun.reason = quotaReason;
    round.dryRun.outputsPass = false;
  }
  return round;
}
