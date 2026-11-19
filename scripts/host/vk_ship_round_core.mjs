import { readFileSync } from 'node:fs';
const REQUIRED_LABELS = ['project:tsv', 'base:vk', 'craig-asked'];
const OFFLINE_TESTS = 'scripts/offline-tests.txt';
const OUTPUT_IDS = ['dialog-pdf', 'keepsake-pdf', 'screens', 'video-check', 'scorecard'];
const OK = new Set(['success', 'pass']);

const rules = JSON.parse(readFileSync(new URL('../fixtures/harness/protected-targets.json', import.meta.url), 'utf8'));

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

export function planCycle(world) {
  const state = world.state || {};
  const actions = [];
  const errors = [];
  const accepts = [];
  const needsRebase = [];
  for (const pull of world.pulls || []) {
    const spec = acceptanceFromBody(pull.body);
    const labeled = REQUIRED_LABELS.every((label) => new Set([...(pull.prLabels || []), ...(pull.issueLabels || [])]).has(label));
    if (labeled && spec?.invalid) {
      errors.push(`acceptance-invalid:${pull.issue || pull.number}`);
      continue;
    }
    if (!eligiblePull(pull)) continue;
    const missing = labelGap(pull.issueLabels);
    if (missing.length) actions.push({ type: 'add-labels', issue: pull.issue, labels: missing });
    if (!world.acceptanceFiles?.[String(pull.issue)]) {
      const spec = acceptanceFromBody(pull.body);
      if (spec?.invalid) errors.push(`acceptance-invalid:${pull.issue}`);
      else actions.push({ type: 'write-acceptance', issue: pull.issue, spec });
    }
    const file = rebaseFile(pull);
    if (file && !state.rebase?.[String(pull.number)]) {
      needsRebase.push({ pr: pull.number, file });
      actions.push({ type: 'needs-rebase', pr: pull.number, file });
    }
    const report = world.checksBySha?.[pull.head] || { checks: [], statuses: [] };
    const current = pull.headNow || pull.head;
    if (current !== pull.head) continue;
    if (!headIsGreen(report, pull.head) || alreadyAccepted(report, pull.head)) continue;
    const count = Array.isArray(spec?.assertions) ? spec.assertions.length : 1;
    accepts.push({ issue: pull.issue, sha: pull.head, pr: pull.number });
    actions.push({
      type: 'accept',
      pr: pull.number,
      issue: pull.issue,
      sha: pull.head,
      description: `#${pull.issue}: ${count}/${count} PASS`,
    });
  }
  const sha = dryRunSha(world.tipLive, state);
  let dryRun = { ran: false, sha: sha || world.tipLive?.live || '', id: '', verdict: '', reason: '', turns: [], outputs: {}, outputsPass: false, per_customer: null, per_100: null, cleanup_remaining: null };
  if (sha) {
    const hit = protectedTarget(world.storyText || '') || protectedTarget(world.databaseUrl || '');
    if (hit) errors.push(hit);
    else {
      dryRun = { ...dryRun, ran: true, id: world.runId || `dry-run-${sha.slice(0, 7)}-openrouter` };
      actions.push({ type: 'dry-run', sha, runId: dryRun.id });
    }
  }
  const round = {
    merges: world.merges || [],
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
