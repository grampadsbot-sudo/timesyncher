#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildGateBApprovedSharedTrip } from './fixtures/gate-b-approved-shared-trip.mjs';
import { resolveStoredCcabKey } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';

const hosted = JSON.parse(
  readFileSync(new URL('./fixtures/nyc-screen-trip99-live-shared-api.json', import.meta.url), 'utf8'),
);
const FACT_KEYS = ['departureTime', 'arrivalTime', 'duration'];
const CLEANUP_COMPLETE_ROWS = [601, 612, 613, 614, 615, 616, 642, 643, 645, 647, 648, 649, 651, 652, 658, 659];

function assertHostedDisplayFacts(trip, label) {
  for (const place of hosted.places) {
    const key = `place:${place.id}`;
    const row = trip.places.find((candidate) => candidate.id === place.id);
    assert.ok(row, `${label}: row ${place.id} present`);
    const override = trip.thingOverrides[key] || {};
    const hostedOverride = hosted.thingOverrides[key] || {};
    for (const field of FACT_KEYS) {
      assert.equal(override[field], hostedOverride[field], `${label}: ${key} ${field} must match hosted`);
    }
    assert.equal(row.price, place.price, `${label}: place ${place.id} price must match hosted`);
    assert.equal(row.externalId, place.externalId, `${label}: place ${place.id} externalId must match hosted`);
  }
  for (const id of CLEANUP_COMPLETE_ROWS) {
    const record = trip.thingOverrides[`place:${id}`]?.sourceRecord;
    const keys = record ? Object.keys(record) : [];
    assert.ok(
      keys.length === 0 || (keys.length === 1 && keys[0] === 'ccabKey'),
      `${label}: row ${id} must not gain a stored sourceRecord from literal intake cleanup (${keys.join(',')})`,
    );
  }
}

const served = buildGateBApprovedSharedTrip();
assertHostedDisplayFacts(served, 'served');
assert.equal(served.thingOverrides['place:652'].departureTime, '23:59');
assert.equal(served.thingOverrides['place:652'].arrivalTime, '08:04');

const replayed = prepareFixtureReplaySharedTrip(Buffer.from(JSON.stringify(served))).served;
assertHostedDisplayFacts(replayed, 'fixture replay');

assert.equal(
  resolveStoredCcabKey({
    name: 'JetBlue LAS-JFK 2026-06-23 23:59-08:04+1',
    category_name: 'Flight',
    website: 'https://www.jetblue.com/booking/flights?from=LAS&to=JFK',
  }, { category: 'flight' }),
  null,
  'an airline website host must not bind a different stored flight option',
);

console.log('gate b live replay display facts regression passed');
