#!/usr/bin/env node
/**
 * Gate B check 6b relevance path: Jev judge timeouts must surface relevance_judge_failed
 * (not opaque place_search_failed), and bounded concurrency must score many candidates.
 */
import assert from 'node:assert/strict';
import { placeSearchClientError } from '../src/vacation/place-search-reply-facts.mjs';
import { attachPlaceRelevance } from '../src/vacation/place-search-relevance.mjs';
import { jevRelevanceScore } from '../src/vacation/place-relevance-judge.mjs';
import { PlaceSearchError } from '../src/vacation/place-search-error.mjs';
import { jevRelevanceJudgeTimeoutMs } from '../src/vacation/keepsake-list-minimums.mjs';

assert.equal(
  placeSearchClientError({ reason: 'relevance_judge_failed', internalError: 'Jev relevance judge HTTP 503' }),
  'relevance_judge_failed',
);
assert.notEqual(
  placeSearchClientError({ reason: 'relevance_judge_failed', internalError: 'Jev relevance judge request failed: timeout' }),
  'place_search_failed',
);

let openRouterCalls = 0;
await assert.rejects(
  () => jevRelevanceScore(
    { id: 't1', name: 'Taco Stand', url: '', category: 'restaurant', address: 'Kihei' },
    {
      apiKey: 'test-key',
      target: 'tacos',
      area: 'Kihei',
      env: { JEV_RELEVANCE_JUDGE_TIMEOUT_MS: '50' },
      fetchImpl: async () => {
        openRouterCalls += 1;
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        throw error;
      },
    },
  ),
  (error) => error instanceof PlaceSearchError
    && error.code === 'relevance_judge_failed'
    && error.judgeTimedOut === true
    && error.judgeTimeoutMs === 50,
);
assert.equal(openRouterCalls, 1);

const rows = Array.from({ length: 12 }, (_, index) => ({
  title: `Taco ${index}`,
  source: 'brave',
  externalId: `b-${index}`,
  category: 'restaurant',
  address: 'Kihei',
}));

let peakInflight = 0;
let inflight = 0;
const scored = await attachPlaceRelevance(rows, async () => {
  inflight += 1;
  peakInflight = Math.max(peakInflight, inflight);
  await new Promise((resolve) => setTimeout(resolve, 5));
  inflight -= 1;
  return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
}, { OPENROUTER_API_KEY: 'test-key' }, { target: 'tacos', area: 'Kihei' }, {
  requireOpenRouterKey: (env) => String(env.OPENROUTER_API_KEY || ''),
});

assert.equal(scored.places.length, 12);
assert.ok(peakInflight <= 6, `expected bounded concurrency, saw ${peakInflight}`);
assert.ok(jevRelevanceJudgeTimeoutMs() >= 40_000, 'default judge budget must cover normal OpenRouter Jev calls');

console.log('test_jev_relevance_judge_timeout_route: ok');
