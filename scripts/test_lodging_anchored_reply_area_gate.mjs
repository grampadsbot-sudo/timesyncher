#!/usr/bin/env node
import assert from 'node:assert/strict';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { citablePlaceTitles, tripOwnedPlaceAllowRows } from '../src/vacation/provider-result-context.mjs';

const tacoResults = [
  { title: 'Aloha Tacos', name: 'Aloha Tacos', source: 'brave' },
  { title: 'Maui Fish Taco', name: 'Maui Fish Taco', source: 'brave' },
];

const tripAllow = tripOwnedPlaceAllowRows({
  destination: 'Kaanapali Maui',
  lodging: 'Hyatt Regency Maui',
  things: [{
    category: 'hotel',
    title: 'Hyatt Regency Maui',
    location: { address: '200 Nohea Kai Dr, Lahaina, HI 96761', locality: 'Kaanapali' },
  }],
});

const lodgingAnchoredReply = 'Near Kaanapali, Aloha Tacos and Maui Fish Taco are easy picks from the Hyatt area.';
assert.equal(
  inTurnPlaceReplyViolation(lodgingAnchoredReply, tacoResults, { tripPlaceAllowRows: tripAllow }),
  null,
);

const kaanapaliApostropheReply = "Aloha Tacos is a short walk from Ka'anapali Beach near the hotel.";
assert.equal(
  inTurnPlaceReplyViolation(kaanapaliApostropheReply, tacoResults, { tripPlaceAllowRows: tripAllow }),
  null,
);

const inventedRestaurant = inTurnPlaceReplyViolation(
  'Try lunch at Secret Taco Cove near the hotel.',
  tacoResults,
  { tripPlaceAllowRows: tripAllow },
);
assert.equal(inventedRestaurant?.status, 'unsourced_place');
assert.equal(inventedRestaurant?.invented?.[0], 'Secret Taco Cove');

const localityRow = { title: "Ka'anapali", name: "Ka'anapali", category: 'locality', source: 'osm' };
assert.deepEqual(citablePlaceTitles([localityRow, ...tacoResults]), ['Aloha Tacos', 'Maui Fish Taco']);

console.log(JSON.stringify({ ok: true, checked: 'lodging-anchored-reply-area-gate' }));
