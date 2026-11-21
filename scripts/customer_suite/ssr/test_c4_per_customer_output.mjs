#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ANCHOR_SET_VERSION } from './anchors.mjs';
import { collectCheckpointReactions } from './checkpoints.mjs';
import { PINNED_EMBEDDING_MODEL, PINNED_EMBEDDING_REVISION } from './embedder.mjs';
import { createHarnessSsrHook } from './hooks.mjs';
import { runCustomer } from '../../harness/customer.mjs';

const replies = {
  after_setup: 'Getting signed in and creating our vacation plan was effortless and genuinely pleasant.',
  after_keepsake: 'I loved the keepsake layout and would happily recommend this AI vacation planner to friends.',
  pricing_10: 'I would gladly pay $10 for this vacation planner right away; it is worth every penny.',
  pricing_17: 'At $17 I am somewhat hesitant and undecided whether I would pay that much.',
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c4-'));
try {
  const story = {
    story_id: 'c4-customer',
    reply_backend: 'openrouter',
    customer: { name: 'Morgan Brooks', email_alias: 'morgan-c4' },
    destination: 'Hilo',
    turns: [{ speaker: 'Morgan Brooks', modality: 'text', text: 'Plan a calm Hilo vacation.' }],
    steps: ['onboarding', 'chat'],
    media: [],
  };
  const reactions = await collectCheckpointReactions({
    keepsakeStatus: 'shown',
    respond: async (ctx) => replies[ctx.checkpoint],
  });
  const ssrHook = createHarnessSsrHook({
    reactionsByStory: { 'c4-customer': reactions },
  });
  const card = await runCustomer(story, {
    runId: 'r-c4',
    outDir: dir,
    ssrHook,
    play: async () => ({
      reason: '',
      liveShaStart: 'sha1',
      liveShaEnd: 'sha1',
      transcript: { turns: [] },
      pdfText: '',
      timings: [],
      steps: ['onboarding'],
      dialogOk: true,
      keepsakeOk: true,
      screensOk: true,
      onboardingPdfOk: true,
      videoExists: true,
      videoPass: true,
      chromeOk: true,
    }),
    cleanup: async () => ({ deleted: {}, remaining: 0 }),
  });

  assert.equal(card.primary_rating_method, 'ssr');
  assert.ok(card.ssr);
  assert.equal(card.ssr.anchor_set_version, ANCHOR_SET_VERSION);
  assert.equal(card.ssr.embedding_model, PINNED_EMBEDDING_MODEL);
  assert.equal(card.ssr.embedding_revision, PINNED_EMBEDDING_REVISION);
  assert.equal(card.ssr.checkpoints.length, 5);

  for (const row of card.ssr.checkpoints) {
    assert.ok(typeof row.checkpoint === 'string' && row.checkpoint.length > 0);
    assert.ok(['intent-to-pay', 'satisfaction', 'recommend'].includes(row.construct));
    assert.ok(typeof row.free_text === 'string' && row.free_text.length > 10);
    assert.equal(row.pmf.length, 5);
    assert.ok(Math.abs(row.pmf.reduce((sum, item) => sum + item, 0) - 1) < 1e-6);
    assert.ok(Number.isFinite(row.expected_score) && row.expected_score >= 1 && row.expected_score <= 5);
    assert.equal(row.anchor_set_version, ANCHOR_SET_VERSION);
    assert.equal(row.embedding_model, PINNED_EMBEDDING_MODEL);
    assert.equal(row.embedding_revision, PINNED_EMBEDDING_REVISION);
  }

  const savedCard = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
  assert.equal(savedCard.ssr.checkpoints.length, 5);
  assert.ok(fs.existsSync(path.join(dir, 'ssr-receipt.json')));
  assert.ok(fs.existsSync(path.join(dir, 'keepsake-ssr.json')));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test_c4_per_customer_output: ok');
