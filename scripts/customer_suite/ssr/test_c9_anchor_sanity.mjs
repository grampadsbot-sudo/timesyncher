#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createLocalBgeEmbedder } from './embedder.mjs';
import { scoreFreeText } from './scorer.mjs';

const embedder = createLocalBgeEmbedder();

const cases = {
  'intent-to-pay': {
    positive: [
      'I would gladly pay $10 right now without hesitation; tremendous value and worth every penny for my vacation.',
      'Even at $17 this is an incredible deal and I am eager to buy this AI vacation planner today.',
    ],
    negative: [
      'No way would I ever pay a dime for this. Complete waste of money and totally worthless.',
      'Hard no on paying $17 for this; terrible deal and I refuse to spend any money on it.',
    ],
    neutral: 'I am honestly undecided about paying $17; I am on the fence and have mixed feelings.',
  },
  satisfaction: {
    positive: [
      'I am thrilled and delighted with how smoothly the AI vacation setup and keepsake turned out. Truly outstanding.',
      'I loved every bit of this vacation experience; effortless, impressive, and exceptional quality.',
    ],
    negative: [
      'This was a frustrating, terrible experience. I am completely dissatisfied and annoyed.',
      'Awful and clunky from start to finish; wasted my time and left me irritated.',
    ],
    neutral: 'It was fine overall, nothing amazing and nothing awful, just an average experience.',
  },
  recommend: {
    positive: [
      'I would enthusiastically recommend this AI vacation planner to everyone I know in a heartbeat.',
      'I strongly endorse and proudly share this vacation planner; excited to tell all my friends to use it.',
    ],
    negative: [
      'I would actively warn people to avoid this and steer clear completely; terrible experience.',
      'Never; I would tell people not to bother and discourage anyone from trying this awful app.',
    ],
    neutral: 'I am unsure whether I would tell friends about it; maybe if they asked, maybe not.',
  },
};

for (const [construct, group] of Object.entries(cases)) {
  for (const text of group.positive) {
    const scored = scoreFreeText({ text, construct, embedder });
    assert.ok(
      scored.expected_score >= 4.0,
      `positive ${construct} scored ${scored.expected_score} (< 4.0) for "${text}"`,
    );
  }
  for (const text of group.negative) {
    const scored = scoreFreeText({ text, construct, embedder });
    assert.ok(
      scored.expected_score <= 2.0,
      `negative ${construct} scored ${scored.expected_score} (> 2.0) for "${text}"`,
    );
  }
  const mid = scoreFreeText({ text: group.neutral, construct, embedder });
  assert.ok(
    mid.expected_score > 2.0 && mid.expected_score < 4.0,
    `neutral ${construct} scored ${mid.expected_score} (expected between 2.0 and 4.0)`,
  );
}

console.log('test_c9_anchor_sanity: ok');
