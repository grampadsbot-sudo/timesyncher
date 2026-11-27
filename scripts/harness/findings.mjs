import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPLY_BACKENDS } from './backends.mjs';

export const DEFAULT_FINDINGS = path.join(os.homedir(), 'tsv-dispatch', 'findings', 'vk-customer-test-findings.md');
export const REQUIRED_HEADINGS = ['# VK customer test findings', '## Section format (harness appends)', '## Entries'];
const LOCK_WAIT_MS = 10000;
const LOCK_STALE_MS = 120000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withFindingsLock(file, work, { waitMs = LOCK_WAIT_MS, staleMs = LOCK_STALE_MS } = {}) {
  const lock = `${file}.lock`;
  const started = Date.now();
  let fd = null;
  while (fd == null) {
    try {
      fd = fs.openSync(lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > staleMs) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() - started > waitMs) throw new Error('refused: findings lock is held');
      sleep(50);
    }
  }
  try {
    fs.writeSync(fd, `${process.pid}\n`);
    return work();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}

function clean(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || 'none';
}

function hst(date = new Date()) {
  return `${date.toLocaleString('en-US', { timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} HST`;
}

export function appendSection(file, text, lockOptions) {
  return withFindingsLock(file, () => {
    const before = fs.readFileSync(file, 'utf8');
    for (const heading of REQUIRED_HEADINGS) {
      if (!before.split('\n').some((line) => line.trim() === heading)) throw new Error(`refused: findings skeleton heading missing: ${heading}`);
    }
    const body = `${before.endsWith('\n') ? '' : '\n'}\n${text.trim()}\n`;
    const fd = fs.openSync(file, 'a');
    try {
      fs.writeSync(fd, body);
    } finally {
      fs.closeSync(fd);
    }
    const after = fs.readFileSync(file, 'utf8');
    if (!after.startsWith(before)) throw new Error('refused: findings file changed under the lock (earlier sections rewritten)');
    return { bytes: Buffer.byteLength(body) };
  }, lockOptions);
}

function turnTimes(card) {
  const walls = (card.turns || []).map((turn) => turn.wall_ms).filter((ms) => Number.isFinite(Number(ms)) && ms != null).map(Number);
  if (!walls.length) return card.mode === 'dry' ? 'not-run (dry)' : 'not measured';
  const sorted = [...walls].sort((a, b) => a - b);
  return `${walls.length} turns, p50 ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted[sorted.length - 1]} ms`;
}

export function replyCostLabel(cost = {}) {
  const unit = String(cost.unit || '').trim().toLowerCase();
  if (cost.state === 'measured' && Number.isFinite(Number(cost.amount)) && (!unit || unit === 'usd')) {
    return `$${Number(cost.amount).toFixed(4)} replies`;
  }
  if (cost.usd_state === 'priced' && Number.isFinite(Number(cost.usd_amount))) {
    return `$${Number(cost.usd_amount).toFixed(4)} replies`;
  }
  if (Number.isFinite(Number(cost.estimate_amount)) && cost.estimate_state === 'estimate') {
    return `~$${Number(cost.estimate_amount).toFixed(4)} replies (estimate)`;
  }
  if (cost.state === 'measured' && (unit === 'tokens' || unit === 'percent' || cost.usd_state === 'unpriced')) {
    return 'unpriced replies';
  }
  if (cost.usd_state === 'unpriced') return 'unpriced replies';
  return `${cost.state || 'not-run'} replies`;
}

function replyCost(card) {
  return replyCostLabel(card.cost || {});
}

export function openRouterCostLabel({ measuredUsd, estimatedUsd, unpricedCalls }) {
  return `$${measuredUsd.toFixed(6)} measured, $${estimatedUsd.toFixed(6)} estimated, ${unpricedCalls} unpriced calls`;
}

function openRouterTurnCosts(card) {
  return (card.turns || []).filter((turn) => turn.role === 'app' && turn.openrouterTotals)
    .map((turn) => `T${turn.n} ${openRouterCostLabel(turn.openrouterTotals)}`).join(' | ');
}

function mediaCost(card) {
  const media = card.media || {};
  if (media.storage_dollars_per_month != null) return `$${media.storage_dollars_per_month}/mo media`;
  return 'media unpriced';
}

export function severityOf(card) {
  if (card.mode === 'dry' && card.verdict !== 'FAIL') return 'minor';
  if (card.verdict === 'FAIL' && (card.wave_stop || /payment|credit|key-limit|coupon|harness-error/.test(String(card.reason || '')))) return 'blocker';
  return card.verdict === 'FAIL' || card.findings?.some(({ status }) => status === 'FLAGGED') ? 'major' : 'minor';
}

export function implicationOf(card) {
  const reason = String(card.reason || '');
  const edge = card.roster?.edge_case || '';
  if (reason === 'key-limit') return 'The app hit a spend/quota limit on its model key, so no reply was generated; the wave stopped. Re-run after the limit resets.';
  if (reason === 'planning-fallback-x3') return 'Fix the planning reply pipeline so itinerary turns produce a real plan instead of repeated fallbacks.';
  if (/coupon/.test(reason)) return 'Checkout must make the coupon step obvious and explain a rejected code in plain words.';
  if (reason === 'no-thing-after-chat') return 'Chat must turn the first answer into a visible plan item, or show why it did not.';
  if (/dialog|keepsake/.test(reason)) return 'The keepsake and Dialog pack must build from whatever the customer finished.';
  if (edge === 'confused') return 'Show the hotel dates and arrival details in one place the customer can check at a glance.';
  if (edge === 'impatient') return 'Give a fast first full-day draft before asking follow-up questions.';
  if (edge === 'changes mind') return 'Let the customer switch destination and switch back without losing earlier work.';
  if (edge === 'coupon misuse') return 'Say clearly that one coupon covers one vacation and cannot be reused or stacked.';
  if (edge === 'quits partway') return 'Save progress and offer a one-tap resume link after the customer leaves mid-chat.';
  return card.verdict !== 'FAIL' ? 'No redesign change from this customer.' : 'Review this customer\'s failing step before the next wave.';
}

function fallbackFinding(card) {
  const fb = card.planning_fallbacks || card.planningFallbacks || null;
  const count = Number(fb?.count) || 0;
  if (!count) return '';
  const turns = Array.isArray(fb?.turns) && fb.turns.length ? ` (turns ${fb.turns.join(', ')})` : '';
  return `planning fallback x${count}${turns}`;
}

export function rescuedTimeoutFinding(card) {
  const rescued = card.rescued_timeouts || card.rescuedTimeouts || null;
  const count = Number(rescued?.count) || 0;
  if (!count) return '';
  const turns = Array.isArray(rescued?.turns) && rescued.turns.length ? ` (turns ${rescued.turns.join(', ')})` : '';
  return `POST failed/timed out but reply was stored x${count}${turns}`;
}

export function interimFlagFinding(card) {
  const flags = Array.isArray(card?.interim_flags) ? card.interim_flags.map((line) => String(line || '').trim()).filter(Boolean) : [];
  if (!flags.length) return '';
  return `interim reply missing, not invented: ${flags.join('; ')}`;
}

export function customerSection(card, { wave, at = new Date() } = {}) {
  const coupon = card.coupon_redemption || {};
  const fbNote = [fallbackFinding(card), rescuedTimeoutFinding(card), interimFlagFinding(card)].filter(Boolean).join('; ');
  const brokeBase = card.verdict === 'FAIL'
    ? clean(`${card.reason}; ${(card.checks || []).filter((check) => !check.pass).sort((a, b) => Number(b.id === 'app-billing') - Number(a.id === 'app-billing')).map((check) => `${check.id}: ${check.detail}`).slice(0, 3).join('; ')}`)
    : card.mode === 'dry' ? 'dry run: live steps not run' : 'nothing';
  const broke = fbNote
    ? (brokeBase === 'nothing' ? fbNote : clean(`${brokeBase}; ${fbNote}`))
    : brokeBase;
  const openRouter = openRouterTurnCosts(card);
  const storedRoute = (card.turns || []).filter((turn) => turn.role === 'app' && turn.ruled)
    .map((turn) => `T${turn.n} ${clean(turn.stored_producer)} / ${clean(turn.stored_backend)}`).join(' | ');
  const corrections = (card.turns || []).filter((turn) => turn.self_correction)
    .map((turn) => `T${turn.n} ${turn.self_correction}`).join(', ');
  return [
    `### ${wave} / customer ${card.roster?.id ?? card.story_id} / ${hst(at)}`,
    `- Arm (A/B): ${card.ab_arm || card.reply_backend} | Coupon: ${clean(coupon.code_hint)} ${clean(coupon.status)} | Edge case: ${clean(card.roster?.edge_case)} | Result: ${card.verdict}${card.mode === 'dry' ? ' (dry)' : ''}`,
    `- What broke or confused: ${broke}`,
    ...(card.findings || []).map(({ id, detail, status, severity, itemsByType }) =>
      `- ${id}: ${status}${severity ? ` (${severity})` : ''} · ${clean(detail)} · DB items by type ${itemsByType ? clean(JSON.stringify(itemsByType)) : 'unmeasured'}`),
    `- Time per turn: ${turnTimes(card)} | Cost ($ replies / $ media): ${replyCost(card)} / ${mediaCost(card)} | Media GB: ${card.media?.gb ?? 'not measured'}${card.media?.source ? ` (${card.media.source})` : ''}`,
    ...(openRouter ? [`- OpenRouter per app turn: ${openRouter}`] : []),
    ...(card.reply_backend === 'trip_state' ? [
      `- App reply path: ${card.app_reply_path || 'Trip State / OpenRouter'}`,
      `- Stored app routes: ${storedRoute || 'unmeasured'}`,
      `- Stored itinerary items: ${card.itineraryCount ?? 'unmeasured'}`,
    ] : []),
    ...(corrections ? [`- App self-correction (Jev): ${corrections}`] : []),
    `- Severity (blocker/major/minor): ${severityOf(card)}`,
    `- Redesign implication (one line): ${implicationOf(card)}`,
  ].join('\n');
}

export function waveSection(summary, { at = new Date() } = {}) {
  const cards = summary.cards || [];
  const fails = cards.filter((card) => card.verdict === 'FAIL');
  const gb = cards.reduce((sum, card) => sum + (Number(card.media?.gb) || 0), 0);
  const blocker = fails.some((card) => severityOf(card) === 'blocker');
  return [
    `### ${summary.wave} / wave summary / ${hst(at)}`,
    `- Arm (A/B): ${REPLY_BACKENDS.map((arm) => `${arm} ${cards.filter((card) => card.reply_backend === arm).length}`).join(', ')} | Coupon: ${cards.filter((card) => /redeemed|reuse_rejected|dry-not-sent/.test(card.coupon_redemption?.status || '')).length}/${cards.length} ok | Edge case: ${cards.filter((card) => card.roster?.edge_case).length} | Result: ${summary.failed ? 'FAIL' : summary.mode === 'dry' ? 'DRY_PASS' : 'PASS'}${summary.stopped ? ` (ramp stopped: ${clean(summary.stopped, 120)})` : ''}`,
    `- What broke or confused: ${fails.length ? clean(fails.map((card) => `${card.roster?.id ?? card.story_id} ${card.reason}`).join('; ')) : 'nothing'}`,
    `- Time per turn: see customer sections | Cost: ${clean(summary.cost)} | Media GB: ${gb.toFixed(3)} total`,
    `- Severity (blocker/major/minor): ${blocker ? 'blocker' : fails.length ? 'major' : 'minor'}`,
    `- Redesign implication (one line): ${fails.length ? implicationOf(fails[0]) : 'No redesign change from this wave.'}`,
  ].join('\n');
}
