#!/usr/bin/env node
import assert from 'node:assert/strict';
import { inTurnPlaceSearchSoftNoResults } from '../src/vacation/place-search-reply-facts.mjs';

const providerLog = [
  { provider: 'nominatim', status: 'ok', reason: 'ok' },
  { provider: 'prior_db', status: 'empty', reason: 'no_results' },
  { provider: 'osm', status: 'empty', reason: 'no_results' },
  { provider: 'brave', status: 'empty', reason: 'no_results' },
];

const placeSearch = {
  status: 'failed',
  reason: 'all_providers_failed',
  code: 'all_providers_failed',
  providers: providerLog,
  internalError: 'Place search failed: nominatim: ok; prior_db: no_results; osm: no_results; brave: no_results',
};

const soft = inTurnPlaceSearchSoftNoResults({
  classification: { target: 'tacos near the hotel', category: 'restaurant' },
  tripDestination: 'Maui',
  placeSearch,
});

assert.equal(soft.enforceInTurnSearch, false);
assert.equal(soft.placeSearchReplyFacts?.placeSearch?.outcome, 'no_results');
assert.match(soft.placeSearchReplyFacts?.placeSearch?.detail || '', /tacos near the hotel/i);
assert.equal(soft.placeSearch.internalError.includes('nominatim'), true);

const hard = inTurnPlaceSearchSoftNoResults({
  classification: { target: 'tacos' },
  tripDestination: 'Maui',
  placeSearch: {
    reason: 'relevance_judge_failed',
    providers: [{ provider: 'openrouter', status: 'error', reason: 'HTTP 503' }],
  },
});
assert.equal(hard, null);

const missingKey = inTurnPlaceSearchSoftNoResults({
  classification: { target: 'tacos' },
  tripDestination: 'Maui',
  placeSearch: {
    error: 'Place search refused to run. Missing BRAVE_SEARCH_API_KEY.',
    providers: [],
  },
});
assert.equal(missingKey, null);

console.log('test_place_search_no_results_reply_facts: ok');
