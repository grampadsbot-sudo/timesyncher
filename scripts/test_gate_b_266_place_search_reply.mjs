#!/usr/bin/env node
/**
 * Gate B #266: check 6 empty reply at 20s tiered timeout; check 6b Hertz saved-car mention.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import {
  finalizeInTurnPlaceShipReply,
  inTurnPlaceGroundedFallbackReply,
  PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS,
  placeSearchTieredReplyTimeoutMs,
} from '../src/vacation/in-turn-place-reply-fallback.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { tripOwnedPlaceAllowRows } from '../src/vacation/provider-result-context.mjs';
import { TIERED_REPLY_TIMEOUT_MS } from './vacation-app-reply-rules.mjs';

const tacoResults = [
  { title: 'Taco Bell', name: 'Taco Bell', source: 'brave', category: 'restaurant' },
  { title: 'El Taco Borracho', name: 'El Taco Borracho', source: 'brave', category: 'restaurant' },
];

assert.ok(PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS > TIERED_REPLY_TIMEOUT_MS);
assert.equal(placeSearchTieredReplyTimeoutMs({}), PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS);

const liveSource = readFileSync(
  fileURLToPath(new URL('../src/vacation/live-app-turn.mjs', import.meta.url)),
  'utf8',
);
assert.match(liveSource, /inTurnPlaceLiveReplyHooks/);
assert.doesNotMatch(liveSource, /blockInTurnPlaceReply/);
assert.match(
  readFileSync(fileURLToPath(new URL('../src/vacation/in-turn-place-reply-fallback.mjs', import.meta.url)), 'utf8'),
  /placeSearchTieredReplyTimeoutMs/,
);

const hertzMention = 'Near the hotel, grab tacos after stopping at Hertz.';
const tripAllow = tripOwnedPlaceAllowRows({
  destination: 'Maui',
  lodging: '200 Nohea Kai Dr, Lahaina, HI 96761',
  tripStatedLodgingArea: 'Kaanapali',
  things: [{
    category: 'hotel',
    title: 'Hyatt Regency Maui',
    location: { locality: 'Kaanapali' },
  }],
});
const hertzViolation = inTurnPlaceReplyViolation(hertzMention, tacoResults, { tripPlaceAllowRows: tripAllow });
assert.equal(hertzViolation?.status, 'unsourced_place');
assert.ok(hertzViolation?.invented?.some((name) => /hertz/i.test(name)), hertzViolation?.invented);

const tripContext = await enrichDraftingTripContext(
  {
    destination: 'Maui',
    lodging: 'Hyatt Regency Maui',
    statedLodgingArea: 'Kaanapali',
    itinerary: ['Hertz rental car at OGG $45 per day', 'Hyatt Regency Maui'],
  },
  {
    things: [
      { category: 'car', title: 'Hertz rental car at OGG $45 per day' },
      { category: 'hotel', title: 'Hyatt Regency Maui', location: { locality: 'Kaanapali' } },
    ],
    inTurnPlaceResults: tacoResults,
    env: {},
  },
);

assert.ok(tripContext.notCitableAsResult.some((title) => /hertz/i.test(title)));
assert.match(tripContext.savedCarContextRule || '', /never mention them in a place-search answer/i);
assert.deepEqual(tripContext.citablePlaces, ['Taco Bell', 'El Taco Borracho']);

const fallback = inTurnPlaceGroundedFallbackReply(tripContext, tacoResults);
assert.match(fallback, /Taco Bell/);
assert.match(fallback, /El Taco Borracho/);
assert.equal(/hertz/i.test(fallback), false);

const recovered = finalizeInTurnPlaceShipReply(hertzMention, true, tacoResults, {
  tripContext,
  tripPlaceAllowRows: tripContext.tripReplyGate,
});
assert.equal(recovered.ok, true);
assert.equal(recovered.usedFallback, true);
assert.equal(inTurnPlaceReplyViolation(recovered.reply, tacoResults, { tripPlaceAllowRows: tripContext.tripReplyGate }), null);

const emptyRecovered = finalizeInTurnPlaceShipReply('', true, tacoResults, {
  tripContext,
  tripPlaceAllowRows: tripContext.tripReplyGate,
});
assert.equal(emptyRecovered.ok, true);
assert.equal(emptyRecovered.usedFallback, true);
assert.ok(String(emptyRecovered.reply || '').trim().length > 0);

const invented = finalizeInTurnPlaceShipReply('Try lunch at Secret Taco Cove near the hotel.', true, tacoResults, {
  tripContext,
  tripPlaceAllowRows: tripContext.tripReplyGate,
});
assert.equal(invented.ok, true);
assert.equal(invented.usedFallback, true);
assert.equal(/Secret Taco Cove/i.test(invented.reply), false);

console.log('test_gate_b_266_place_search_reply: ok');
