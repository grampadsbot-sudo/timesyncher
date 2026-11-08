#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildDayTimeline, resolvePlace } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { itineraryLineText } from '../src/vacation/itinerary-line.mjs';
import { existsSync, readFileSync } from 'node:fs';

const stripTrip = applyLiveAppListRowFields({
  places: [{ id: 651, name: 'Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13', category_name: 'Flight' }],
  thingOverrides: { 'place:651': { category: 'flight', price: 257 } },
});
assert.equal(
  stripTrip.places[0].name,
  'Delta LAS-JFK 2026-06-23 07:05-15:13',
  'strip Flight option: prefix from stored flight name for live payload',
);
assert.equal(
  stripTrip.thingOverrides['place:651'].title,
  'Delta LAS-JFK 2026-06-23 07:05-15:13',
  'override title matches stripped name',
);

assert.equal(
  itineraryLineText({
    itineraryNote: 'Documented NYC option (flight)',
  }),
  '',
  'pipeline Documented … option stub must not surface as itinerary line',
);
assert.equal(
  itineraryLineText({}),
  '',
  'missing itineraryNote must not fall back to assignment or override notes',
);

const day = { id: 1, day_number: 1, title: 'Day 1' };
const unpickedOnAssignments = {
  days: [day],
  places: [
    {
      id: 201,
      name: 'Southwest LAS → LGA 05:05–15:45',
      category_name: 'Flight',
      lat: 36.084,
      lng: -115.1537,
    },
    {
      id: 202,
      name: 'Museum visit',
      category_name: 'event',
      lat: 40.75,
      lng: -73.99,
    },
  ],
  assignments: {
    1: [
      { place_id: 201, notes: '' },
      { place_id: 202, notes: '' },
    ],
  },
  thingOverrides: {
    'place:201': { timeline: false, category: 'flight', price: 239 },
    'place:202': {
      timeline: true,
      category: 'activity',
      itineraryNote: 'Stored museum itinerary line',
    },
  },
};
const rowsUnpicked = buildDayTimeline(unpickedOnAssignments, day);
assert.equal(
  rowsUnpicked.some((row) => row.kind === 'flight' && row.place?.id === 201),
  false,
  'timeline:false flight must not appear on Day-by-Day',
);
assert.ok(
  rowsUnpicked.some(
    (row) => row.kind === 'thing' && row.place?.id === 202 && row.itineraryNote === 'Stored museum itinerary line',
  ),
  'timeline thing row shows stored itineraryNote',
);

const restaurantThenMuseum = {
  days: [day],
  places: [
    { id: 301, name: 'Cafe A', category_name: 'Restaurant', lat: 40.7, lng: -74.0 },
    { id: 302, name: 'Museum B', category_name: 'event', lat: 40.75, lng: -73.99 },
  ],
  assignments: {
    1: [
      { place_id: 301, notes: '' },
      { place_id: 302, notes: '' },
    ],
  },
  thingOverrides: {
    'place:301': { timeline: true, category: 'restaurant', itineraryNote: 'First stop note.' },
    'place:302': { timeline: true, category: 'activity', itineraryNote: 'Second stop note.' },
  },
};
const rowsTravel = buildDayTimeline(restaurantThenMuseum, day);
assert.ok(
  rowsTravel.some((row) => row.kind === 'travel'),
  'ground travel still inserts between two timeline non-flight places',
);

assert.doesNotMatch(
  stripTrip.places[0].name,
  /^Flight option:/i,
  'served catalog flight name must not keep Flight option: prefix',
);

const embedHostPath = '/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json';
if (existsSync(embedHostPath)) {
  const { served } = prepareFixtureReplaySharedTrip(readFileSync(embedHostPath));
  let embedStub = 0;
  for (const rows of Object.values(served.assignments || {})) {
    for (const row of rows || []) {
      if (/^Flight option:/i.test(row?.place?.name || '')) embedStub++;
    }
  }
  assert.equal(embedStub, 0, 'assignment place snapshots must match stripped catalog names after replay');
  const day1 = served.days.find((d) => Number(d.day_number) === 1);
  const stubRow = (served.assignments?.[String(day1?.id)] || []).find((row) =>
    /^Flight option:/i.test(row?.place?.name || ''),
  );
  if (stubRow) {
    const resolved = resolvePlace(stubRow, served);
    assert.doesNotMatch(
      String(resolved?.name || ''),
      /^Flight option:/i,
      'resolvePlace must bind assignment rows to served catalog names',
    );
  }
}

console.log('issue #832 day timeline binding checks passed');
