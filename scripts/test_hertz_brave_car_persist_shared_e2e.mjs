#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';
import { HERTZ_KAHULUI_BRAVE } from './fixtures/place-search-brave-hertz-kahului.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { mergePlaces, placeToTripThing, queryBravePlaceSearch } from '../src/vacation/place-search.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

process.env.TIMESYNCHER_TRAVEL_BASE_URL = process.env.TIMESYNCHER_TRAVEL_BASE_URL || 'https://travel.example';

const tripId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const inserts = [];

const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (/from trip_things/i.test(text) && /source in/i.test(text)) return [];
  if (/insert into trip_things/i.test(text)) {
    const id = crypto.randomUUID();
    inserts.push({ id });
    return [{ id }];
  }
  if (/count\(\*\)/i.test(text) && /trip_things/i.test(text)) return [{ n: inserts.length }];
  if (/update trips/i.test(text)) {
    const patch = values.find((v) => v?.publicSlug)
      || values.map((v) => {
        if (typeof v !== 'string' || !v.startsWith('{')) return null;
        try { return JSON.parse(v); } catch { return null; }
      }).find((v) => v?.publicSlug);
    return [{ public_slug: patch?.publicSlug || `intake-${tripId.replace(/-/g, '').slice(0, 12)}` }];
  }
  if (/select metadata->>'publicSlug'/i.test(text)) return [{ public_slug: `intake-${tripId.replace(/-/g, '').slice(0, 12)}` }];
  if (/select metadata/i.test(text) && /from trips/i.test(text)) return [{ metadata: {} }];
  return [];
};

const tripEnv = {
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://travel.example',
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation.example',
};

const center = { lat: 20.8913266, lng: -156.4410129, label: 'Kahului, Maui' };
const { places } = await queryBravePlaceSearch(
  async () => ({ ok: true, json: async () => ({ results: HERTZ_KAHULUI_BRAVE }) }),
  { brave: 'brave-test-key' },
  { center, locationText: 'Kahului', compactLocality: 'Kahului', namedPlaceLookup: true },
  [{ category: 'store', q: 'Hertz Kahului, Kahului', limit: 5, place: true, targetKind: 'named_place', target: 'Hertz Kahului', intakeLodgingLookup: true }],
);

assert.equal(places.length, 1);
assert.equal(places[0].category, 'car');

const merged = mergePlaces([places]);
assert.equal(merged.length, 1, 'car category must survive mergePlaces');
assert.equal(merged[0].category, 'car');

const thing = placeToTripThing(places[0]);
assert.equal(thing.category, 'car');

const inserted = await insertTripThing(db, {
  tripId,
  requestId,
  thing,
  env: tripEnv,
});
assert.ok(inserted?.id);
assert.equal(inserted.category, 'car');

const record = thingRecordFromTripRow({
  id: inserted.id,
  category: inserted.category,
  title: inserted.title,
  description: inserted.description,
  metadata: thing.metadata,
  ratings: thing.ratings,
  location: thing.location,
  source: thing.source,
});

const shared = applyCapturedLogos(sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Maui March 2027',
    destination: 'Maui',
    start_date: '2027-03-10',
    end_date: '2027-03-17',
    metadata: { intakeShare: true, publicSlug: `intake-${tripId.replace(/-/g, '').slice(0, 12)}` },
  },
  things: [record],
}));

const served = finalizeServedSharedTripPayload(shared);
const carsGrade = gradeSharedTabLogoUrlRecords(served, 'cars');
assert.ok(carsGrade.placeCount >= 1, `expected Cars tab places, got ${carsGrade.placeCount}`);
assert.equal(carsGrade.records[0]?.category, 'Car');
assert.match(String(served.places?.[0]?.name || served.places?.[0]?.title || ''), /Hertz Car Rental/);

console.log('test_hertz_brave_car_persist_shared_e2e: ok');
