#!/usr/bin/env node
import assert from 'node:assert/strict';
import { SSR_CONSTRUCTS } from './anchors.mjs';
import { createLocalBgeEmbedder } from './embedder.mjs';
import { SSR_FLOAT_TOLERANCE, scoreFreeText } from './scorer.mjs';

assert.equal(SSR_FLOAT_TOLERANCE, 1e-6);

const samples = {
  'intent-to-pay': 'At $10 this feels fair and helpful for organizing my next vacation, so I would likely pay for it.',
  satisfaction: 'The AI vacation planner felt clear, smooth, and genuinely helpful from start to finish.',
  recommend: 'I would happily tell friends planning a getaway to give this AI vacation planner a try.',
};

const embedderA = createLocalBgeEmbedder({ useCache: false });
const embedderB = createLocalBgeEmbedder({ useCache: false });

for (const construct of SSR_CONSTRUCTS) {
  const first = scoreFreeText({
    text: samples[construct],
    construct,
    embedder: embedderA,
  });
  const second = scoreFreeText({
    text: samples[construct],
    construct,
    embedder: embedderB,
  });
  assert.equal(first.embedding_model, second.embedding_model);
  assert.equal(first.embedding_revision, second.embedding_revision);
  assert.equal(first.anchor_set_version, second.anchor_set_version);
  assert.ok(
    Math.abs(first.expected_score - second.expected_score) <= SSR_FLOAT_TOLERANCE,
    `expected_score drift on ${construct}: ${first.expected_score} vs ${second.expected_score}`,
  );
  for (let index = 0; index < 5; index += 1) {
    assert.ok(
      Math.abs(first.pmf[index] - second.pmf[index]) <= SSR_FLOAT_TOLERANCE,
      `pmf[${index}] drift on ${construct}: ${first.pmf[index]} vs ${second.pmf[index]}`,
    );
  }
}

const singleVec = embedderA.embedTexts([samples.satisfaction])[0];
const batchVecs = embedderB.embedTexts([
  samples['intent-to-pay'],
  samples.satisfaction,
  samples.recommend,
]);
for (let index = 0; index < singleVec.length; index += 1) {
  assert.ok(
    Math.abs(singleVec[index] - batchVecs[1][index]) <= SSR_FLOAT_TOLERANCE,
    `batch order drift at dim ${index}`,
  );
}

console.log('test_c8_determinism: ok');
