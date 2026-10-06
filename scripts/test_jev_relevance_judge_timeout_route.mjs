#!/usr/bin/env node
/**
 * Gate B check 6b relevance: loud timeout errors, stage budget, and capped judges.
 */
import assert from 'node:assert/strict';
import { placeSearchClientError } from '../src/vacation/place-search-reply-facts.mjs';
import { attachPlaceRelevance } from '../src/vacation/place-search-relevance.mjs';
import { jevRelevanceScore } from '../src/vacation/place-relevance-judge.mjs';
import { PlaceSearchError } from '../src/vacation/place-search-error.mjs';
import {
  jevRelevanceJudgeTimeoutMs,
  jevRelevanceStageBudgetMs,
  VACATION_ITINERARY_ROUTE_MAX_MS,
} from '../src/vacation/place-relevance-stage-budget.mjs';
import {
  KAANAPALI_GEOCODE,
  KAANAPALI_ON_TARGET_BRAVE,
} from './fixtures/place-relevance-kaanapali-brave.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

assert.equal(
  placeSearchClientError({ reason: 'relevance_judge_failed', internalError: 'Jev relevance judge HTTP 503' }),
  'relevance_judge_failed',
);

assert.throws(() => jevRelevanceJudgeTimeoutMs({ JEV_RELEVANCE_JUDGE_TIMEOUT_MS: 'nope' }), /positive integer/);

let openRouterCalls = 0;
await assert.rejects(
  () => jevRelevanceScore(
    { id: 't1', name: 'Taco Stand', url: '', category: 'restaurant', address: 'Kihei' },
    {
      apiKey: 'test-key',
      target: 'tacos',
      area: 'Kihei',
      env: {},
      timeoutMs: 50,
      fetchImpl: async () => {
        openRouterCalls += 1;
        const error = new Error('network stalled');
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

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

function stagingFetch({ perCallDelayMs = 8 }) {
  let jevCalls = 0;
  let peakInflight = 0;
  let inflight = 0;
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      jevCalls += 1;
      inflight += 1;
      peakInflight = Math.max(peakInflight, inflight);
      await new Promise((resolve) => setTimeout(resolve, peakInflight > 10 ? 25_000 : perCallDelayMs));
      inflight -= 1;
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  };
  return { fetchImpl, stats: () => ({ jevCalls, peakInflight }) };
}

const fortyRows = Array.from({ length: 40 }, (_, index) => ({
  title: `Candidate ${index}`,
  source: 'brave',
  externalId: `b-${index}`,
  category: 'restaurant',
  address: 'Kaanapali',
}));
const cappedMock = stagingFetch({ perCallDelayMs: 3 });
const capped = await attachPlaceRelevance(
  fortyRows,
  cappedMock.fetchImpl,
  { OPENROUTER_API_KEY: 'test-key' },
  { target: 'tacos', area: 'Kaanapali Maui', category: 'restaurant' },
  { requireOpenRouterKey: (env) => String(env.OPENROUTER_API_KEY || '') },
);
const cappedStats = cappedMock.stats();
assert.equal(cappedStats.jevCalls, 15, 'restaurant cap must judge only first-pass limit');
assert.equal(capped.relevanceJudgeSkipped, 25);
assert.ok(cappedStats.peakInflight <= 3, `concurrency 3 expected, peak ${cappedStats.peakInflight}`);
assert.ok(capped.relevanceStageMs < jevRelevanceStageBudgetMs());

const stageBudget = jevRelevanceStageBudgetMs();
assert.ok(stageBudget < VACATION_ITINERARY_ROUTE_MAX_MS);

const check6Env = {
  OPENROUTER_API_KEY: 'test-key',
  BRAVE_SEARCH_API_KEY: 'test-brave',
};
const check6Mock = stagingFetch({ perCallDelayMs: 6 });
const check6Started = Date.now();
const check6Search = await searchPlaces({
  destination: 'Kaanapali Maui',
  queries: [{
    category: 'restaurant',
    q: 'best tacos near our hotel',
    limit: 5,
    place: true,
    targetKind: 'category',
    target: 'tacos',
  }],
  relevanceTarget: 'tacos',
  relevanceArea: 'Kaanapali Maui',
  searchAnchor: { text: 'Hyatt Regency Maui', source: 'lodging' },
  env: check6Env,
  fetchImpl: check6Mock.fetchImpl,
});
const check6Ms = Date.now() - check6Started;
assert.ok(check6Search.places.length > 0, JSON.stringify(check6Search.places.map((row) => row.title)));
assert.ok(
  check6Ms < stageBudget + 2_000,
  `check-6b fixture wall ${check6Ms}ms must stay under ${stageBudget}ms relevance stage budget`,
);
assert.ok(
  Number(check6Search.providerTimings?.relevanceJudgeCalls) <= 15,
  `expected <=15 Jev calls, got ${check6Search.providerTimings?.relevanceJudgeCalls}`,
);

console.log('test_jev_relevance_judge_timeout_route: ok');
