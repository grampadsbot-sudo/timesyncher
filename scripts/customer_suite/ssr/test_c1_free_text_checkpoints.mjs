#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  SSR_CHECKPOINTS,
  assertFreeTextPrompt,
  assertFreeTextReply,
  collectCheckpointReactions,
  getCheckpointDefinition,
} from './checkpoints.mjs';
import { assertCopyRules } from './safety.mjs';

const ids = SSR_CHECKPOINTS.map((item) => item.id);
assert.deepEqual(ids, ['after_setup', 'after_keepsake', 'pricing_10', 'pricing_17']);
assert.equal(getCheckpointDefinition('pricing_10').price_usd, 10);
assert.equal(getCheckpointDefinition('pricing_17').price_usd, 17);

for (const checkpoint of SSR_CHECKPOINTS) {
  assertFreeTextPrompt(checkpoint.prompt);
  assertCopyRules([checkpoint.prompt, checkpoint.label]);
  assert.doesNotMatch(checkpoint.prompt, /\b1\s*(?:to|-|–)\s*5\b/i);
  assert.doesNotMatch(checkpoint.prompt, /\blikert\b/i);
  assert.doesNotMatch(checkpoint.prompt, /\bgive\s+a\s+(?:score|number|rating)\b/i);
}

assert.throws(() => assertFreeTextPrompt('Please rate this from 1 to 5.'), /numeric rating/);
assert.throws(() => assertFreeTextPrompt('Give a score for your vacation.'), /numeric rating/);
assert.throws(() => assertFreeTextPrompt('Pick a Likert integer for this planner.'), /numeric rating/);
assert.throws(() => assertFreeTextPrompt('How was your trip setup?'), /never trip/);
assert.throws(() => assertFreeTextReply('4', 'after_setup'), /bare Likert integer/);
assert.throws(() => assertFreeTextReply('', 'after_setup'), /empty free-text/);

const sampleReplies = {
  after_setup: 'Signing in and creating the vacation plan felt smooth, clear, and genuinely helpful.',
  after_keepsake: 'The keepsake captured our vacation highlights nicely, and I would gladly tell friends to try this AI planner.',
  pricing_10: 'At $10 this feels like a great deal for organizing my vacation and I would gladly pay for it.',
  pricing_17: 'At $17 I am a bit more hesitant, though the AI itinerary and keepsake still feel worthwhile.',
};

const shownReceipt = await collectCheckpointReactions({
  keepsakeStatus: 'shown',
  respond: async (ctx) => {
    assert.ok(ctx.prompt.length > 20);
    return sampleReplies[ctx.checkpoint];
  },
});

assert.equal(shownReceipt.length, 4);
for (const entry of shownReceipt) {
  assert.ok(entry.prompt.length > 20);
  assert.equal(entry.reply, sampleReplies[entry.checkpoint]);
}
assert.equal(shownReceipt.find((item) => item.checkpoint === 'after_keepsake').keepsake_status, 'shown');

const skippedReceipt = await collectCheckpointReactions({
  keepsakeStatus: 'skipped',
  keepsakeNote: 'keepsake skipped in staging run and recorded',
  respond: async (ctx) => sampleReplies[ctx.checkpoint],
});
const skippedKeepsake = skippedReceipt.find((item) => item.checkpoint === 'after_keepsake');
assert.equal(skippedKeepsake.keepsake_status, 'skipped');
assert.match(skippedKeepsake.keepsake_note, /skipped/);

console.log('test_c1_free_text_checkpoints: ok');
