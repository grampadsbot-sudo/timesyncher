#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assignDates, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import { applyChatPlaceSearchForVacationTurn } from '../src/vacation/chat-place-search.mjs';
import {
  chatPlaceSearchSavedReplyFacts,
  stampChatSavedPlaceThing,
  whenStampFromClassification,
} from '../src/vacation/chat-place-search-when.mjs';
import {
  REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';
import { applyPlaceSearchReplyFacts } from '../src/vacation/place-search-reply-facts.mjs';

const tripDates = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
const saturday = tripDates.find((date) => new Date(`${date}T12:00:00.000Z`).getUTCDay() === 6);
assert.equal(saturday, '2026-11-21');

const saturdayClassification = {
  ok: true,
  turnKind: 'place_search',
  things: [{ name: 'seafood dinner', kind: 'restaurant', who: '', when: 'Saturday' }],
};

assert.deepEqual(
  whenStampFromClassification(saturdayClassification, 'Harbor Grill'),
  { whenLabel: 'Saturday', customerWhen: '' },
);

const stamped = stampChatSavedPlaceThing(
  { title: 'Harbor Grill', category: 'restaurant', metadata: { sourceRef: { id: 'x', source: 'brave' } } },
  saturdayClassification,
);
assert.equal(stamped.metadata.whenLabel, 'Saturday');
assert.equal(stamped.metadata.customerWhen, '');
assert.deepEqual(assignDates({
  whenLabel: stamped.metadata.whenLabel,
  customerWhen: stamped.metadata.customerWhen,
}, 2026, tripDates), [saturday]);

function mockDb(tripStart = '2026-11-20', tripEnd = '2026-11-27') {
  const inserts = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ');
    if (/select\s+id,\s*title,\s*location/i.test(sql) && /from trip_things/i.test(sql)) return [];
    if (/select\s+start_date,\s*end_date/i.test(sql) && /from trips/i.test(sql)) {
      return [{ start_date: tripStart, end_date: tripEnd }];
    }
    if (/select\s+destination,\s*metadata/i.test(sql) && /from trips/i.test(sql)) {
      return [{ destination: 'Seattle', metadata: {} }];
    }
    if (sql.includes('insert into trip_things')) {
      inserts.push(values);
      return [{ id: `trip-thing-${inserts.length}` }];
    }
    if (sql.includes('update transcript_turns')) return [];
    return [];
  };
  return { db, inserts };
}

function placeClassification(when = '') {
  return {
    ok: true,
    turnKind: 'place_search',
    target: 'tacos',
    category: 'restaurant',
    anchor: 'Seattle',
    anchorIsLodging: false,
    routerModel: 'router-test-model',
    things: when ? [{ name: 'tacos', kind: 'restaurant', who: '', when }] : [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
    error: null,
  };
}

function mockPlace(title) {
  return {
    source: 'brave',
    title,
    category: 'restaurant',
    lat: 47.6,
    lng: -122.3,
    address: 'Seattle, WA',
    url: 'https://example.com/place',
    externalId: 'brave-place-1',
  };
}

const { db: satDb, inserts: satInserts } = mockDb();
const satApplied = await applyChatPlaceSearchForVacationTurn({
  db: satDb,
  tripId: 'trip-sat',
  requestId: 'req-sat',
  classification: placeClassification('Saturday'),
  placeSearchTurn: true,
  tripDestination: 'Seattle',
  payload: { wantedThings: [] },
  customerLive: {},
  turnId: 'turn-sat',
  publishShare: async () => {},
  searchImpl: async () => ({ places: [mockPlace('Saturday Harbor Grill')], notes: [] }),
});
assert.equal(satApplied.kind, 'ok');
assert.equal(satInserts.length, 1);
const satMeta = JSON.parse(satInserts[0].find((value) => typeof value === 'string' && value.includes('whenLabel')));
assert.equal(satMeta.whenLabel, 'Saturday');
assert.equal(satMeta.customerWhen, '');
assert.deepEqual(satApplied.placeSearchReplyFacts?.chatPlaceSearch?.scheduled?.[0]?.dates, [saturday]);
assert.equal(satApplied.placeSearchReplyFacts?.chatPlaceSearch?.unscheduled?.length || 0, 0);

const { db: plainDb, inserts: plainInserts } = mockDb();
const plainApplied = await applyChatPlaceSearchForVacationTurn({
  db: plainDb,
  tripId: 'trip-plain',
  requestId: 'req-plain',
  classification: placeClassification(''),
  placeSearchTurn: true,
  tripDestination: 'Seattle',
  payload: { wantedThings: [] },
  customerLive: {},
  turnId: 'turn-plain',
  publishShare: async () => {},
  searchImpl: async () => ({
    places: [mockPlace('Plain Taco Spot'), mockPlace('Second Taco Spot')],
    notes: [],
  }),
});
assert.equal(plainApplied.kind, 'ok');
assert.equal(plainInserts.length, 2);
for (const row of plainInserts) {
  const meta = JSON.parse(row.find((value) => typeof value === 'string' && value.includes('sourceRef')));
  assert.equal(meta.whenLabel || '', '');
  assert.equal(meta.customerWhen || '', '');
}
const unscheduledTitles = (plainApplied.placeSearchReplyFacts?.chatPlaceSearch?.unscheduled || []).map((row) => row.title);
assert.deepEqual(unscheduledTitles.sort(), ['Plain Taco Spot', 'Second Taco Spot'].sort());
assert.equal(plainApplied.placeSearchReplyFacts?.chatPlaceSearch?.scheduled?.length || 0, 0);

const factsCtx = applyPlaceSearchReplyFacts({ itinerary: [] }, plainApplied.placeSearchReplyFacts);
assert.deepEqual(factsCtx.chatPlaceSearch.unscheduled.map((row) => row.title).sort(), unscheduledTitles.sort());

assert.equal(
  replyActionClaimReason(
    'I added Plain Taco Spot to Saturday for you.',
    null,
    { unscheduledChatPlaceTitles: ['Plain Taco Spot'] },
  ),
  REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY,
);
assert.equal(
  replyActionClaimReason(
    'Plain Taco Spot is saved but not on a day yet.',
    null,
    { unscheduledChatPlaceTitles: ['Plain Taco Spot'] },
  ),
  '',
);

const shared = sharedTripFromIntake({
  trip: { id: 'trip-spread', start_date: tripDates[0], end_date: tripDates[tripDates.length - 1] },
  things: unscheduledTitles.map((title) => ({
    id: title,
    title,
    category: 'restaurant',
    source: 'brave',
    metadata: { whenLabel: '', customerWhen: '' },
  })),
});
const dayIdSets = shared.places.map((place) => shared.thingOverrides[`place:${place.id}`]?.dayIds || []);
assert.deepEqual(dayIdSets, [[], []]);

const savedFactsOnly = chatPlaceSearchSavedReplyFacts([
  { title: 'A', whenLabel: '', customerWhen: '' },
  { title: 'B', whenLabel: '', customerWhen: '' },
], tripDates[0], tripDates[tripDates.length - 1]);
assert.equal(savedFactsOnly.chatPlaceSearch.scheduled.length, 0);
assert.equal(savedFactsOnly.chatPlaceSearch.unscheduled.length, 2);

console.log(JSON.stringify({
  ok: true,
  checked: 'chat-place-search-when',
  saturday,
  reasonCode: REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY,
}));
