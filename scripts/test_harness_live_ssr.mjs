#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateSsrWave } from './customer_suite/ssr/aggregate.mjs';
import { createLocalBgeEmbedder } from './customer_suite/ssr/embedder.mjs';
import { scoreCustomerCheckpoints } from './customer_suite/ssr/scorer.mjs';
import { collectLiveSsrCheckpoint, createLiveSsrRespond } from './harness/live-ssr.mjs';

const story = {
  story_id: 'harness-live-ssr-fixture',
  reply_backend: 'vk_bot_mcp',
  customer: { name: 'Fixture Customer' },
  destination: 'Hilo',
  turns: [{ text: 'Plan a week on the Big Island.' }],
};

let askCalls = 0;
const customerAsk = async ({ goal }) => {
  askCalls += 1;
  const prompt = String(goal || '').trim();
  return { text: `Harness stub model reply (${prompt.slice(0, 40)}).`, model: 'fixture-stub' };
};

const liveSsrRespond = createLiveSsrRespond({ story, customerAsk, env: {} });
const ssrReactions = [];

ssrReactions.push(await collectLiveSsrCheckpoint('after_setup', liveSsrRespond));
assert.ok(askCalls >= 1, 'after_setup uses role-played customer model path');

for (const [checkpointId, extra] of [
  ['after_keepsake', { keepsakeStatus: 'shown', keepsakeNote: 'fixture keepsake' }],
  ['pricing_10', {}],
  ['pricing_17', {}],
]) {
  ssrReactions.push(await collectLiveSsrCheckpoint(checkpointId, liveSsrRespond, extra));
}

assert.equal(ssrReactions.length, 4);
assert.deepEqual(
  ssrReactions.map((row) => row.checkpoint),
  ['after_setup', 'after_keepsake', 'pricing_10', 'pricing_17'],
);
assert.equal(askCalls, 4);
assert.ok(ssrReactions.every((row) => row.reply.includes('Harness stub model reply')));
assert.ok(!ssrReactions.some((row) => /It answered some of it|Keep the days lighter/.test(row.reply)));

const embedder = createLocalBgeEmbedder();
const ssr = scoreCustomerCheckpoints({
  storyId: story.story_id,
  customerName: story.customer.name,
  reactions: ssrReactions,
  embedder,
});
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-ssr-'));
fs.writeFileSync(path.join(outDir, 'ssr-receipt.json'), `${JSON.stringify({ reactions: ssrReactions, ssr }, null, 2)}\n`);
assert.ok(fs.existsSync(path.join(outDir, 'ssr-receipt.json')));

const aggregate = aggregateSsrWave([{ story_id: story.story_id, ssr_reactions: ssrReactions, ssr }]);
assert.equal(aggregate.has_ssr, true);

console.log('ok test_harness_live_ssr.mjs');