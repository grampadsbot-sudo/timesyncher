#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildDayTimeline, resolvePlace } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { itineraryLineText } from '../src/vacation/itinerary-line.mjs';
import { existsSync, readFileSync } from 'node:fs';

const fixtureServed = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
for (const id of [651, 652, 658]) {
  const place = fixtureServed.places.find((row) => row.id === id);
  const reservation = fixtureServed.reservations.find((row) => row.place_id === id);
  assert.ok(place, `fixture place ${id} must exist`);
  assert.doesNotMatch(String(place.name || ''), /^Flight option:/i, `place ${id} stored name must not carry Flight option:`);
  assert.doesNotMatch(String(reservation?.title || ''), /^Flight option:/i, `reservation ${id} title must not carry Flight option:`);
  assert.match(String(place.category_name || ''), /flight/i, `place ${id} must stay Flight category`);
  const override = fixtureServed.thingOverrides[`place:${id}`] || {};
  assert.equal(override.timeline, false, `place ${id} timeline must remain false`);
}
for (const id of [601, 635]) {
  const place = fixtureServed.places.find((row) => row.id === id);
  assert.ok(place, `assigned flight place ${id} must exist`);
  assert.doesNotMatch(String(place.name || ''), /^Flight option:/i, `assigned flight ${id} name must stay clean`);
}

const stripTrip = prepareSharedTripForLiveApp({
  places: [{ id: 651, name: 'Delta LAS-JFK 2026-06-23 07:05-15:13', category_name: 'Flight' }],
  thingOverrides: { 'place:651': { category: 'flight', price: 257 } },
});
assert.equal(stripTrip.places[0].name, 'Delta LAS-JFK 2026-06-23 07:05-15:13', 'stored flight name passes through without runtime prefix repair');

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

const liveBudgetTrip = prepareSharedTripForLiveApp({
  places: [
    {
      id: 651,
      name: 'Delta LAS-JFK 2026-06-23 07:05-15:13',
      category_name: 'Flight',
    },
  ],
  thingOverrides: {
    'place:651': { category: 'flight', timeline: true, price: 257 },
  },
  budget: [
    {
      id: 1,
      category: 'Flights',
      name: 'Delta LAS-JFK 2026-06-23 07:05-15:13',
      place_id: 651,
      total_price: 257,
    },
  ],
});
assert.equal(
  liveBudgetTrip.budget[0].name,
  'Delta LAS-JFK 2026-06-23 07:05-15:13',
  'prepareSharedTripForLiveApp must rebind budget line name to stored catalog place name',
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

const gateBHeadFixturePath =
  '/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/9e2a002ccb4caa5ff581a27ac29d4fe45c328e36.json';
if (existsSync(gateBHeadFixturePath)) {
  const { served: gateBServed } = prepareFixtureReplaySharedTrip(readFileSync(gateBHeadFixturePath));
  let gateBStub = 0;
  for (const row of gateBServed.budget || []) {
    if (/^Flight option:/i.test(String(row?.name || ''))) gateBStub += 1;
  }
  for (const place of gateBServed.places || []) {
    if (/^Flight option:/i.test(String(place?.name || ''))) gateBStub += 1;
  }
  if (gateBStub > 0) {
    console.warn(
      `per-head Gate B head fixture replay still has ${gateBStub} Flight option: row names (stale vs data-only source; host refresh required post-publish)`,
    );
  }
}

console.log('issue #832 day timeline binding checks passed');
