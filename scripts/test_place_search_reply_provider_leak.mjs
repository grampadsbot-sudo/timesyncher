#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  REPLY_PLACE_SEARCH_PROVIDER_LEAK,
  placeSearchNoResultsOutcome,
  placeSearchReplyFacts,
  replyPlaceSearchProviderLeakReason,
} from '../src/vacation/place-search-reply-facts.mjs';
import {
  assertCustomerReplyShippable,
  ReplyIdCitationBlockedError,
} from '../src/vacation/reply-id-citation.mjs';

const providerLog = [
  { provider: 'nominatim', status: 'ok', reason: 'ok' },
  { provider: 'prior_db', status: 'empty', reason: 'no_results' },
  { provider: 'osm', status: 'empty', reason: 'no_results' },
  { provider: 'brave', status: 'empty', reason: 'no_results' },
];

assert.equal(
  placeSearchNoResultsOutcome({ code: 'all_providers_failed', providerAttempts: providerLog, placesCount: 0 }),
  true,
);

const facts = placeSearchReplyFacts({ target: 'tacos near the hotel', code: 'all_providers_failed' });
assert.equal(facts.placeSearch.outcome, 'no_results');
assert.match(facts.placeSearch.detail, /nothing found nearby for tacos near the hotel/i);
assert.doesNotMatch(JSON.stringify(facts), /nominatim|prior_db|brave|osm/i);

const leakText = 'Place search failed: nominatim: ok; prior_db: no_results; osm: no_results; brave: no_results';
assert.equal(replyPlaceSearchProviderLeakReason(leakText), REPLY_PLACE_SEARCH_PROVIDER_LEAK);

assert.throws(
  () => assertCustomerReplyShippable(leakText, 'trip-leak'),
  (error) => error instanceof ReplyIdCitationBlockedError && error.reason === REPLY_PLACE_SEARCH_PROVIDER_LEAK,
);

const honest = 'I could not find strong taco spots near your hotel in what we searched just now.';
assert.equal(replyPlaceSearchProviderLeakReason(honest), '');
assertCustomerReplyShippable(honest, 'trip-leak');

console.log('test_place_search_reply_provider_leak: ok');
