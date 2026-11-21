#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ANCHOR_SET_VERSION } from './anchors.mjs';
import { collectCheckpointReactions } from './checkpoints.mjs';
import { createLocalBgeEmbedder, PINNED_EMBEDDING_MODEL, PINNED_EMBEDDING_REVISION } from './embedder.mjs';
import { scoreCustomerCheckpoints } from './scorer.mjs';
import { runWave } from '../../harness/wave.mjs';

const embedder = createLocalBgeEmbedder();

const customerReplies = {
  cust1: {
    after_setup: 'Thrilled and delighted with how smoothly the AI vacation setup worked.',
    after_keepsake: 'Loved the keepsake and would enthusiastically recommend this AI vacation planner to everyone.',
    pricing_10: 'I would gladly pay $10 right now; worth every penny.',
    pricing_17: 'Even at $17 I would happily buy this vacation planner today.',
  },
  cust2: {
    after_setup: 'Frustrating and clunky setup; left me completely dissatisfied and annoyed.',
    after_keepsake: 'Awful keepsake experience; I would warn people to steer clear and avoid it.',
    pricing_10: 'No way would I pay $10; complete waste of money.',
    pricing_17: 'Hard no on $17; I refuse to spend a dime on this.',
  },
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c5-wave-'));
try {
  const stories = [{ story_id: 'cust1' }, { story_id: 'cust2' }];
  const wave = await runWave(stories, {
    runId: 'wave-c5',
    outRoot: dir,
    concurrency: 1,
    continueOnFail: true,
    run: async (story) => {
      const reactions = await collectCheckpointReactions({
        keepsakeStatus: 'shown',
        respond: async (ctx) => customerReplies[story.story_id][ctx.checkpoint],
      });
      const ssr = scoreCustomerCheckpoints({
        storyId: story.story_id,
        reactions,
        embedder,
      });
      return {
        story_id: story.story_id,
        reply_backend: story.reply_backend,
        verdict: 'PASS',
        reason: '',
        wave_stop: false,
        checks: [],
        turns: [{ role: 'app', wall_ms: 120, jev_score: 4, cost_state: 'measured' }],
        cost: { state: 'measured', amount: 0.02, unit: 'usd', gap: '', per_customer: 0.02 },
        primary_rating_method: 'ssr',
        ssr,
      };
    },
  });

  const boardJson = JSON.parse(fs.readFileSync(path.join(wave.dir, 'scoreboard.json'), 'utf8'));
  const boardMd = fs.readFileSync(path.join(wave.dir, 'scoreboard.md'), 'utf8');

  assert.equal(boardJson.primary_rating_method, 'ssr');
  assert.equal(boardJson.ssr.has_ssr, true);
  assert.deepEqual(boardJson.ssr.anchor_set_versions, [ANCHOR_SET_VERSION]);
  assert.deepEqual(boardJson.ssr.embedding_models, [PINNED_EMBEDDING_MODEL]);
  assert.deepEqual(boardJson.ssr.embedding_revisions, [PINNED_EMBEDDING_REVISION]);
  assert.equal(boardJson.ssr.by_checkpoint_construct.length, 5);
  assert.equal(boardJson.ssr.by_construct.length, 3);

  for (const row of boardJson.ssr.by_checkpoint_construct) {
    assert.equal(row.n, 2);
    assert.equal(row.distribution.length, 5);
    assert.ok(Math.abs(row.distribution.reduce((sum, item) => sum + item, 0) - 1) < 1e-6);
    assert.ok(Number.isFinite(row.mean_expected_score));
    assert.equal(row.per_customer.length, 2);
  }

  assert.match(boardMd, /## SSR Ratings \(Primary\)/);
  assert.match(boardMd, /after_setup/);
  assert.match(boardMd, /after_keepsake/);
  assert.match(boardMd, /pricing_10/);
  assert.match(boardMd, /pricing_17/);
  assert.match(boardMd, /intent-to-pay/);
  assert.match(boardMd, /satisfaction/);
  assert.match(boardMd, /recommend/);
  assert.match(boardMd, /mean expected score/i);
  assert.match(boardMd, /aggregate distribution/i);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test_c5_aggregate_scoreboard: ok');
