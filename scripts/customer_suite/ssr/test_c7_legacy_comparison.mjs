#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateSsrWave, extractLegacyDlrComparison, ssrScoreboardMarkdown } from './aggregate.mjs';
import { collectCheckpointReactions } from './checkpoints.mjs';
import { createLocalBgeEmbedder } from './embedder.mjs';
import { scoreCustomerCheckpoints } from './scorer.mjs';
import { compareBackends, comparisonMarkdown } from '../../harness/comparison.mjs';
import { runWave } from '../../harness/wave.mjs';

const embedder = createLocalBgeEmbedder();
const reactions = await collectCheckpointReactions({
  keepsakeStatus: 'shown',
  respond: async (ctx) => ({
    after_setup: 'Completely dissatisfied and frustrated; terrible vacation setup experience.',
    after_keepsake: 'Awful keepsake; I would warn people to steer clear and avoid it.',
    pricing_10: 'No way would I pay $10; complete waste of money.',
    pricing_17: 'Hard no on $17; I refuse to spend a dime.',
  })[ctx.checkpoint],
});
const ssr = scoreCustomerCheckpoints({
  storyId: 'c7-neg-customer',
  reactions,
  embedder,
});

const cards = [
  {
    story_id: 'c7-neg-customer',
    reply_backend: 'openrouter',
    verdict: 'PASS',
    reason: '',
    checks: [],
    turns: [{ role: 'app', wall_ms: 100, jev_score: 5, cost_state: 'measured' }],
    cost: { state: 'measured', amount: 0.02, unit: 'usd', gap: '', per_customer: 0.02 },
    dlr_score: 5,
    primary_rating_method: 'ssr',
    ssr,
  },
];

const aggregate = aggregateSsrWave(cards);
assert.equal(aggregate.primary_rating_method, 'ssr');
assert.equal(aggregate.dlr_comparison.role, 'comparison_only');
assert.equal(aggregate.dlr_comparison.is_primary, false);
assert.equal(aggregate.dlr_comparison.mean, 5);

const sat = aggregate.by_construct.find((row) => row.construct === 'satisfaction');
assert.ok(sat.mean_expected_score <= 2.0);
assert.notEqual(sat.mean_expected_score, aggregate.dlr_comparison.mean);

const dlrOnly = extractLegacyDlrComparison(cards);
assert.equal(dlrOnly.is_primary, false);
assert.equal(dlrOnly.role, 'comparison_only');

const md = ssrScoreboardMarkdown(aggregate);
assert.match(md, /## SSR Ratings \(Primary\)/);
assert.match(md, /Comparison Column Only — Non-Primary/);
assert.match(md, /no \(comparison only\)/);

const compared = compareBackends(cards);
assert.equal(compared[0].quality_mean_role, 'comparison_only');
assert.equal(compared[0].dlr_comparison_mean, 5);
assert.match(comparisonMarkdown(compared), /legacy DLR\/jev comparison \(non-primary\)/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c7-wave-'));
try {
  const wave = await runWave([{ story_id: 'c7-neg-customer' }], {
    runId: 'wave-c7',
    outRoot: dir,
    concurrency: 1,
    continueOnFail: true,
    run: async () => cards[0],
  });
  const boardJson = JSON.parse(fs.readFileSync(path.join(wave.dir, 'scoreboard.json'), 'utf8'));
  assert.equal(boardJson.primary_rating_method, 'ssr');
  assert.equal(boardJson.ssr.dlr_comparison.is_primary, false);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test_c7_legacy_comparison: ok');
