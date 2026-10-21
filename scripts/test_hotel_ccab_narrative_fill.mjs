#!/usr/bin/env node
import assert from 'node:assert/strict';

import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';
import {
  applySourcedHotelDescriptionToRecord,
  composeSourcedHotelDescriptionFromRecord,
} from '../src/vacation/xai-sourced-hotel-description.mjs';

function narrativeWordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

const xaiHotelRecord = applySourcedHotelDescriptionToRecord({
  category: 'hotel',
  googleRating: '4.2',
  googleReviewCount: '900',
  yelpRating: '3.8',
  yelpReviewCount: '120',
  reviewThemes: {
    praise: ['great location near Lincoln Center', 'quiet rooms for NYC', 'helpful front desk', 'walkable to subway'],
    complaints: ['small elevators'],
  },
  websiteFlavour: 'Upper West Side hotel with classic pre-war charm, fitness room, and walkable access to Central Park.',
  xaiRatingsFetched: true,
}, { title: 'Hotel Belleclaire Central Park', category: 'hotel' });

const xaiDescription = String(xaiHotelRecord.description || '');
assert.ok(narrativeWordCount(xaiDescription) >= 10, 'xAI hotel fill must compose a sourced description');
assert.equal(isGenericDescription(xaiDescription), false);

const composedOnly = composeSourcedHotelDescriptionFromRecord({
  websiteFlavour: 'Times Square micro-hotel with compact rooms and strong transit links.',
  googleRating: '4.0',
  googleReviewCount: '500',
  price: 210,
}, { title: 'Sample hotel', address: 'New York, NY' });
assert.ok(composedOnly.length >= 40);
assert.match(composedOnly, /Times Square/i);

const hotelFixture = {
  places: [{
    id: 701,
    name: 'Hotel Belleclaire Central Park',
    category_name: 'Hotel',
    category: { name: 'Hotel' },
    description: 'Documented NYC option (hotel)',
    price: null,
  }],
  thingOverrides: {
    'place:701': { timeline: false, category: 'hotel' },
  },
};

const replay = prepareFixtureReplaySharedTrip(Buffer.from(JSON.stringify(hotelFixture))).served;
const replayPlace = replay.places.find((place) => place.id === 701);
const replayWords = narrativeWordCount(rowSummary(replayPlace, replay));
assert.ok(replayWords >= 6, `fixture replay hotel narrative (${replayWords} words)`);
assert.equal(isGenericDescription(rowSummary(replayPlace, replay)), false);

const live = applyLiveAppListRowFields(structuredClone(hotelFixture));
const livePlace = live.places.find((place) => place.id === 701);
const liveWords = narrativeWordCount(rowSummary(livePlace, live));
assert.ok(liveWords >= 6, `live serve hotel narrative (${liveWords} words)`);

console.log('hotel ccab narrative fill tests passed');
