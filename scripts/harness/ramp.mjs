import path from 'node:path';
import { createCouponLedger } from './coupon.mjs';
import { creditHeadroom, readCreditSnapshot } from './credit-guard.mjs';
import { appendSection, customerSection, waveSection } from './findings.mjs';
import { RAMP_SIZES, waveStories } from './roster.mjs';
import { runWave } from './wave.mjs';

export function waveFailed(result) {
  if (!result) return true;
  if (result.stopped) return true;
  if ((result.cards || []).length < Number(result.planned ?? 0)) return true;
  return (result.cards || []).some((card) => card.verdict === 'FAIL');
}

function measuredPerCustomer(waves) {
  const cards = waves.flatMap((wave) => wave.result?.cards || []).filter((card) => card.cost?.state === 'measured' && Number.isFinite(Number(card.cost.amount)));
  if (!cards.length) return null;
  return Math.max(...cards.map((card) => Number(card.cost.amount)));
}

function spent(cards) {
  return cards.reduce((sum, card) => sum + (card.cost?.state === 'measured' ? Number(card.cost.amount) || 0 : 0), 0);
}

function costLine(cards) {
  const total = spent(cards);
  return cards.some((card) => card.cost?.state === 'measured') ? `$${total.toFixed(4)} replies measured` : 'replies not measured';
}

export async function runRamp(customers, options) {
  const sizes = options.sizes || RAMP_SIZES;
  const run = options.runWaveImpl || runWave;
  const dry = options.mode === 'dry';
  const env = options.env || process.env;
  const findings = options.findingsFile;
  const waves = [];
  for (const size of sizes) {
    const runId = `${options.runId}-w${size}`;
    const label = `wave ${size} (${runId})`;
    const stories = options.storiesFor ? options.storiesFor(size) : waveStories(customers, size, { dialogStories: options.dialogStories });
    const openRouterCount = stories.filter((story) => story.reply_backend !== 'vk_bot_mcp').length;
    const needsCredits = !dry && openRouterCount > 0;
    if (needsCredits) {
      const snapshot = readCreditSnapshot(env);
      const headroom = creditHeadroom({ snapshot, customers: openRouterCount, projectedPerCustomer: measuredPerCustomer(waves), env });
      if (!headroom.ok) {
        const summary = { wave: label, mode: options.mode, cards: [], failed: true, stopped: `${headroom.reason}: ${headroom.detail}`, cost: 'not-run' };
        if (findings) appendSection(findings, waveSection(summary));
        waves.push({ size, runId, refused: summary.stopped, result: null });
        return { waves, stopped_at: size, reason: summary.stopped };
      }
    }
    const ledger = createCouponLedger(path.join(options.outRoot, runId, 'coupon-ledger.json'));
    const snapshot = needsCredits ? readCreditSnapshot(env) : null;
    const result = await run(stories, {
      ...options,
      runId,
      ledger,
      continueOnFail: false,
      beforeCustomer: needsCredits ? (story, done) => (story.reply_backend === 'vk_bot_mcp'
        ? { ok: true }
        : creditHeadroom({
          snapshot,
          customers: 1,
          projectedPerCustomer: measuredPerCustomer([...waves, { result: { cards: done } }]),
          spentSoFar: spent(done),
          env,
        })) : null,
      onCard: findings ? (card) => appendSection(findings, customerSection(card, { wave: label })) : null,
    });
    const failed = waveFailed(result);
    if (findings) appendSection(findings, waveSection({ wave: label, mode: options.mode, cards: result.cards, failed, stopped: result.stopped, cost: costLine(result.cards) }));
    waves.push({ size, runId, result, failed });
    if (failed) {
      const first = result.cards.find((card) => card.verdict === 'FAIL');
      return { waves, stopped_at: size, reason: result.stopped || (first ? `${first.story_id} ${first.reason}` : 'wave incomplete') };
    }
  }
  return { waves, stopped_at: null, reason: '' };
}
