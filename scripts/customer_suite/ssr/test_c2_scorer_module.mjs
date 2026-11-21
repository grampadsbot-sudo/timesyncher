#!/usr/bin/env node
import assert from 'node:assert/strict';
import { ANCHOR_SET_VERSION, SSR_CONSTRUCTS, getAnchorSet, listAnchorVersions } from './anchors.mjs';
import { createLocalBgeEmbedder, PINNED_EMBEDDING_MODEL, PINNED_EMBEDDING_REVISION } from './embedder.mjs';
import {
  averagePmfs,
  cosineSimilarity,
  expectedScore,
  scoreFreeText,
  similaritiesToPmf,
} from './scorer.mjs';

assert.deepEqual(SSR_CONSTRUCTS, ['intent-to-pay', 'satisfaction', 'recommend']);
assert.ok(listAnchorVersions().includes(ANCHOR_SET_VERSION));

for (const construct of SSR_CONSTRUCTS) {
  const bundle = getAnchorSet(construct, ANCHOR_SET_VERSION);
  assert.equal(bundle.version, ANCHOR_SET_VERSION);
  assert.equal(bundle.sets.length, 6);
  for (const set of bundle.sets) {
    assert.equal(set.length, 5);
    for (const statement of set) {
      assert.ok(statement.trim().length > 10);
      assert.doesNotMatch(statement, /\btrips?\b/i);
    }
  }
}

assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-12);
assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-12);

const linearPmf = similaritiesToPmf([0.5, 0.6, 0.7, 0.8, 0.9], { temperature: 1 });
assert.equal(linearPmf.length, 5);
assert.ok(Math.abs(linearPmf[0]) < 1e-12);
assert.ok(Math.abs(linearPmf[1] - 0.1) < 1e-12);
assert.ok(Math.abs(linearPmf[2] - 0.2) < 1e-12);
assert.ok(Math.abs(linearPmf[3] - 0.3) < 1e-12);
assert.ok(Math.abs(linearPmf[4] - 0.4) < 1e-12);
assert.ok(Math.abs(expectedScore(linearPmf) - 4.0) < 1e-12);

const uniformPmf = similaritiesToPmf([0.7, 0.7, 0.7, 0.7, 0.7], { temperature: 1 });
assert.deepEqual(uniformPmf, [0.2, 0.2, 0.2, 0.2, 0.2]);
assert.ok(Math.abs(expectedScore(uniformPmf) - 3.0) < 1e-12);

const avg = averagePmfs([
  [0, 0, 0, 0.5, 0.5],
  [0, 0, 0.5, 0.5, 0],
]);
assert.ok(Math.abs(avg.reduce((sum, item) => sum + item, 0) - 1) < 1e-12);
assert.ok(Math.abs(avg[2] - 0.25) < 1e-12);
assert.ok(Math.abs(avg[3] - 0.5) < 1e-12);
assert.ok(Math.abs(avg[4] - 0.25) < 1e-12);

const embedder = createLocalBgeEmbedder();
for (const construct of SSR_CONSTRUCTS) {
  const result = scoreFreeText({
    text: 'I am delighted with this AI vacation planner and gladly recommend and pay for it.',
    construct,
    embedder,
  });
  assert.equal(result.construct, construct);
  assert.equal(result.set_count, 6);
  assert.equal(result.anchor_set_version, ANCHOR_SET_VERSION);
  assert.equal(result.embedding_model, PINNED_EMBEDDING_MODEL);
  assert.equal(result.embedding_revision, PINNED_EMBEDDING_REVISION);
  assert.equal(result.pmf.length, 5);
  const sum = result.pmf.reduce((acc, item) => acc + item, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6);
  assert.ok(result.expected_score >= 1 && result.expected_score <= 5);
  assert.ok(Math.abs(result.expected_score - expectedScore(result.pmf)) < 1e-12);
}

console.log('test_c2_scorer_module: ok');
