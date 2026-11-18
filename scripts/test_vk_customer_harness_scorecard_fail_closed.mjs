#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyAppFailure } from './harness/backends.mjs';
import { compareBackends, formatCostAmount, formatEstimateDollars, percentile } from './harness/comparison.mjs';
import { readStoredCost, rollupCost, VK_BOT_USAGE_DOLLARS_PER_PERCENT } from './harness/cost.mjs';
import { buildScorecard } from './harness/scorecard.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';
import { runWave } from './harness/wave.mjs';

const transcript = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/transcript-fixture.json', import.meta.url), 'utf8'));
const before = JSON.stringify(transcript);
const confirmed = confirmStoredTurns(transcript, 'timing: jev=400ms gen=2400ms model=anthropic/claude-haiku-5.5 tier=2 max_tokens=900', 'openrouter');
assert.equal(JSON.stringify(transcript), before);
assert.equal(confirmed.rows[1].stored_model, 'anthropic/claude-haiku-5.5');
assert.equal(confirmed.rows[1].jev_score, 4);
assert.equal(confirmed.rows[1].stored_backend, '');
assert.ok(confirmed.gaps.includes('stored-backend-missing'));
assert.ok(confirmed.gaps.includes('stored-cost-missing'));
assert.equal(confirmed.rows[1].reply_backend, 'openrouter');

const priced = { total_tokens: 1000, listed_price_per_token: 0.000002 };
const pricedBefore = JSON.stringify(priced);
assert.equal(readStoredCost(priced, 'openrouter').amount, 0.002);
assert.equal(JSON.stringify(priced), pricedBefore);
assert.equal(readStoredCost({ total_tokens: 1000 }, 'openrouter').gap, 'stored-cost-missing');
assert.equal(readStoredCost({ generationCost: 'unmeasured' }, 'openrouter').state, 'unmeasured');
assert.equal(readStoredCost({ generationCost: 1.25 }, 'openrouter').amount, 1.25);
assert.equal(readStoredCost({ botTokens: 40 }, 'vk_bot_mcp').unit, 'tokens');
const percentCost = readStoredCost({ usagePercentDelta: 1.5 }, 'vk_bot_mcp');
assert.equal(percentCost.unit, 'percent');
assert.equal(percentCost.amount, 1.5);
assert.equal(VK_BOT_USAGE_DOLLARS_PER_PERCENT, 2);
assert.equal(percentCost.estimate_amount, 3);
assert.equal(percentCost.estimate_label, 'estimate');
assert.equal(percentCost.estimate_unit, 'usd');
const tokenCost = readStoredCost({ botTokens: 40 }, 'vk_bot_mcp');
assert.equal(tokenCost.unit, 'tokens');
assert.equal(tokenCost.estimate_state, 'unmeasured');
assert.equal(tokenCost.estimate_amount, null);
const missingBot = readStoredCost({}, 'vk_bot_mcp');
assert.equal(missingBot.gap, 'stored-cost-missing');
assert.equal(missingBot.estimate_amount, null);
assert.equal(readStoredCost({ usagePercentDelta: 'unmeasured' }, 'vk_bot_mcp').state, 'unmeasured');
assert.equal(readStoredCost({ usagePercentDelta: 'unmeasured' }, 'vk_bot_mcp').estimate_amount, null);
const botRollup = rollupCost([
  { role: 'app', cost_state: 'measured', cost_amount: 1, cost_unit: 'percent', gap: '', estimate_state: 'estimate', estimate_amount: 2 },
  { role: 'app', cost_state: 'measured', cost_amount: 0.5, cost_unit: 'percent', gap: '', estimate_state: 'estimate', estimate_amount: 1 },
]);
assert.equal(botRollup.per_customer, 1.5);
assert.equal(botRollup.unit, 'percent');
assert.equal(botRollup.estimate_per_customer, 3);
assert.equal(botRollup.estimate_label, 'estimate');
assert.equal(readStoredCost({ generationCost: 1.25 }, 'openrouter').estimate_amount, undefined);
const costSource = fs.readFileSync(new URL('./harness/cost.mjs', import.meta.url), 'utf8');
assert.equal(costSource.includes('insert '), false);
assert.equal(costSource.includes('update '), false);

const missingCost = buildScorecard({
  run_id: 'r1', story_id: 'dry-run', reply_backend: 'openrouter', checks: [], gaps: ['stored-cost-missing'],
  started_at: '2026-11-18T00:00:00.000Z', ended_at: '2026-11-18T00:00:01.000Z',
});
assert.equal(missingCost.verdict, 'FAIL');
assert.equal(missingCost.reason, 'stored-cost-missing');
assert.equal(missingCost.checks.find((check) => check.id === 'dialog-pdf').pass, false);
const jevGap = buildScorecard({
  run_id: 'r1', story_id: 'dry-run', reply_backend: 'openrouter', checks: [], gaps: ['stored-jev-score-missing'],
  started_at: '2026-11-18T00:00:00.000Z', ended_at: '2026-11-18T00:00:01.000Z',
});
assert.equal(jevGap.reason, 'stored-jev-score-missing');
const payment = buildScorecard({
  run_id: 'r1', story_id: 'dry-run', reply_backend: 'openrouter', reason: 'payment-required', checks: [],
  started_at: '2026-11-18T00:00:00.000Z', ended_at: '2026-11-18T00:00:01.000Z',
});
assert.equal(payment.reason, 'payment-required');
assert.equal(payment.wave_stop, true);
assert.equal(classifyAppFailure(402, {}), 'payment-required');
assert.equal(classifyAppFailure(200, { error: 'credit exhausted' }), 'credit-exhausted');
const refused = buildScorecard({
  run_id: 'r1', story_id: 'dry-run', reply_backend: 'vk_bot_mcp', reason: 'backend-not-available',
  checks: [{ id: 'backend-available', pass: false, detail: 'backend not available', artifact: '' }],
  started_at: '2026-11-18T00:00:00.000Z', ended_at: '2026-11-18T00:00:01.000Z',
});
assert.equal(refused.reason, 'backend-not-available');
assert.equal(refused.wave_stop, true);
assert.match(refused.checks.find((check) => check.id === 'backend-available').detail, /backend not available/);

const measured = rollupCost([
  { role: 'app', cost_state: 'measured', cost_amount: 0.01, cost_unit: 'usd', gap: '' },
  { role: 'app', cost_state: 'measured', cost_amount: 0.03, cost_unit: 'usd', gap: '' },
]);
assert.equal(measured.per_customer, 0.04);
const unmeasured = rollupCost([{ role: 'app', cost_state: 'unmeasured', cost_amount: null, cost_unit: 'usd', gap: '' }]);
assert.equal(unmeasured.state, 'unmeasured');
assert.equal(unmeasured.amount, null);

function card(id, backend, amount, reason = '') {
  return {
    story_id: id,
    reply_backend: backend,
    verdict: reason ? 'FAIL' : 'PASS',
    reason,
    wave_stop: reason === 'credit-exhausted' || reason === 'payment-required' || reason === 'backend-not-available',
    checks: [],
    turns: [{ role: 'app', wall_ms: 100, jev_score: 4, cost_state: 'measured' }],
    cost: amount == null ? { state: 'unmeasured', amount: null, unit: 'usd', gap: '', per_customer: null } : { state: 'measured', amount, unit: backend === 'openrouter' ? 'usd' : 'tokens', gap: '', per_customer: amount },
  };
}
const comparison = compareBackends([card('a', 'openrouter', 0.02), card('b', 'openrouter', 0.04), card('c', 'vk_bot_mcp', 10)]);
assert.equal(comparison[0].cost_per_customer, 0.03);
assert.equal(comparison[0].cost_per_100, 3);
assert.equal(comparison[1].cost_unit, 'tokens');
assert.equal(comparison[1].cost_per_100, 1000);
assert.equal(comparison[0].estimated_dollars_per_customer, null);
assert.equal(comparison[0].estimated_dollars_state, 'not-run');
assert.equal(comparison[1].estimated_dollars_state, 'unmeasured');
assert.equal(comparison[1].estimated_dollars_per_customer, null);
const pricedBot = {
  story_id: 'bot-percent',
  reply_backend: 'vk_bot_mcp',
  verdict: 'PASS',
  reason: '',
  checks: [],
  turns: [{ role: 'app', wall_ms: 80, jev_score: 4, cost_state: 'measured' }],
  cost: { state: 'measured', amount: 1.5, unit: 'percent', gap: '', per_customer: 1.5, estimate_state: 'estimate', estimate_amount: 3, estimate_per_customer: 3, estimate_unit: 'usd', estimate_label: 'estimate' },
};
const sided = compareBackends([card('a', 'openrouter', 0.02), pricedBot]);
assert.equal(sided[0].cost_per_customer, 0.02);
assert.equal(sided[0].cost_unit, 'usd');
assert.equal(sided[0].cost_per_100, 2);
assert.equal(sided[1].usage_percent_per_customer, 1.5);
assert.equal(sided[1].usage_percent_per_100, 150);
assert.equal(sided[1].estimated_dollars_per_customer, 3);
assert.equal(sided[1].estimated_dollars_per_100, 300);
assert.equal(sided[1].estimated_dollars_label, 'estimate');
assert.equal(formatEstimateDollars(sided[1].estimated_dollars_per_customer, sided[1].estimated_dollars_state), '$3.0000 estimate');
assert.equal(formatEstimateDollars(null, 'unmeasured'), 'unmeasured');
assert.notEqual(sided[0].cost_per_customer, sided[1].estimated_dollars_per_customer);
assert.equal(formatCostAmount(null, 'usd', 'unmeasured', ''), 'unmeasured');
assert.equal(percentile([10, 30], 50), 10);
assert.equal(percentile([10, 20, 40], 95), 40);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wave-'));
const stories = [{ story_id: 'one' }, { story_id: 'two' }];
const stopped = await runWave(stories, {
  runId: 'wave1', outRoot: dir, concurrency: 1, continueOnFail: true,
  run: async (story) => card(story.story_id, story.reply_backend, null, 'credit-exhausted'),
});
assert.equal(stopped.cards.length, 1);
const continued = await runWave(stories, {
  runId: 'wave2', outRoot: dir, concurrency: 1, continueOnFail: true,
  run: async (story) => card(story.story_id, story.reply_backend, 1, 'stored-backend-missing'),
});
assert.equal(continued.cards.length, 2);
const board = fs.readFileSync(path.join(dir, 'wave2', 'scoreboard.md'), 'utf8');
assert.match(board, /cost \/ customer/);
assert.match(board, /cost \/ 100/);
const sample = fs.readFileSync(path.join(dir, 'wave2', 'blind-sample.json'), 'utf8');
const key = JSON.parse(fs.readFileSync(path.join(dir, 'wave2', 'blind-key.json'), 'utf8'));
assert.equal(sample.includes('openrouter'), false);
assert.equal(sample.includes('vk_bot_mcp'), false);
assert.equal(sample.includes('wave_blind_key'), false);
assert.equal(key.map.length, 2);
assert.equal(key.map[0].reply_backend, 'openrouter');
fs.rmSync(dir, { recursive: true, force: true });
console.log('test_vk_customer_harness_scorecard_fail_closed: ok');
