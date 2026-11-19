import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_LABELS = ['project:tsv', 'base:vk', 'craig-asked'];
const OFFLINE_TESTS = 'scripts/offline-tests.txt';
const OUTPUT_IDS = ['dialog-pdf', 'keepsake-pdf', 'screens', 'video-check', 'scorecard'];
const OK = new Set(['success', 'pass']);

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
  { pr: 1040, issue: 1039, sha: 'b5237f05c60a0651ad27533d4ccd4bffb7dd2dc6' },
  { pr: 1044, issue: 1043, sha: 'a3d2981a783a569ccb20fb7d9ae03e877fca68d7' },
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
  lines.push('live-accept python3 live_accept.py');
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
  const match = String(body || '').match(/```acceptance\s*\n([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return { invalid: true };
  }
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

export function doorbellReasons(round, previous = {}) {
  const reasons = [];
  const dry = round.dryRun;
  if (dry?.ran && dry.verdict === 'PASS' && dry.outputsPass) reasons.push('dry-run-pass');
  if (dry?.ran && dry.verdict !== 'PASS' && dry.reason && dry.reason !== previous.reason) reasons.push('new-failure');
  if ((round.needsRebase || []).some((row) => !previous.rebase?.[String(row.pr)])) reasons.push('needs-rebase');
  const error = (round.errors || []).join('|');
  if (error && error !== (previous.error || '')) reasons.push('error');
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
  };
}

export function planPull(pull, world, pinSha = '') {
  const state = world.state || {};
  const actions = [];
  const errors = [];
  const needsRebase = [];
  const spec = acceptanceFromBody(pull.body);
  const issue = Number(pull.issue) || 0;
  if (!issue) {
    errors.push(`missing-issue:${pull.number}`);
    return { actions, errors, needsRebase };
  }
  if (spec?.invalid) {
    errors.push(`acceptance-invalid:${issue}`);
    return { actions, errors, needsRebase };
  }
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
  if (!headIsGreen(report, pull.head)) return { actions, errors, needsRebase };
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
  if (canMerge(pull)) actions.push({ type: 'merge', pr: pull.number, issue, sha: pull.head });
  return { actions, errors, needsRebase };
}

function appendDeployOrDry(actions, world, errors) {
  const state = world.state || {};
  const merges = actions.filter((action) => action.type === 'merge');
  if (merges.length) {
    actions.push({ type: 'batch-deploy' });
    actions.push({ type: 'live-accept' });
    actions.push({ type: 'dry-run-after-deploy' });
    return blankDry('');
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
    if (action.type === 'accept') lines.push(`accept ${action.sha}`);
    if (action.type === 'merge') lines.push('merge');
    if (action.type === 'needs-rebase') lines.push(`needs-rebase ${action.file}`);
    if (action.type === 'batch-deploy') lines.push('batch-deploy python3 tsv_dispatch.py --batch-deploy');
    if (action.type === 'live-accept') lines.push('live-accept python3 live_accept.py');
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
  };
  if (round.dryRun.cleanup_remaining !== 0 && round.dryRun.cleanup_remaining != null) {
    round.dryRun.outputsPass = false;
    round.dryRun.verdict = 'FAIL';
  }
  return round;
}
