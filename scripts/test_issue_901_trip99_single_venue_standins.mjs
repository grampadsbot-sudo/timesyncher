#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assessThingStandInPresentation,
  scanTripThingStandIns,
  thingAddressStreetReason,
  thingTitleStandInReason,
} from '../src/vacation/trip99-thing-standin-check.mjs';

assert.equal(
  thingTitleStandInReason('Village Vanguard / Smoke / Birdland / Jazz Gallery', 669),
  'title_bundle_slash',
);
assert.equal(
  thingTitleStandInReason('e’s BAR / The Dead Poet / Lilly’s Cocktail & Wine', 672),
  'title_bundle_slash',
);
assert.equal(thingTitleStandInReason('Guided walking/audio history tours', 664), 'title_generic_category');
assert.equal(thingTitleStandInReason('Dizzy’s Club / Jazz at Lincoln Center', 663), null);
assert.equal(thingTitleStandInReason('Birdland Jazz Club', 669), null);
assert.equal(thingAddressStreetReason('Upper West Side, New York, NY', 'restaurant'), 'address_neighborhood_only');
assert.equal(thingAddressStreetReason('511 Amsterdam Ave, New York, NY 10024', 'restaurant'), null);

const staging = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/gate-b-nyc-shared-staging.json', import.meta.url)), 'utf8'),
);
const scan = scanTripThingStandIns(staging, { tripId: 99 });
assert.equal(scan.pass, true, JSON.stringify(scan.failures?.slice(0, 8)));

for (const id of [664, 669, 672]) {
  const place = staging.places.find((row) => row.id === id);
  assert.ok(place, `place ${id}`);
  assert.equal(place.name.includes(' / '), false, `place ${id} name must not bundle`);
  const row = assessThingStandInPresentation(place, staging.thingOverrides?.[`place:${id}`] || {});
  assert.equal(row.pass, true, `place ${id}: ${JSON.stringify(row)}`);
}

const regression = scanTripThingStandIns({
  trip: { id: 99 },
  places: [
    { id: 9901, name: 'Village Vanguard / Smoke / Birdland / Jazz Gallery', category_name: 'Attraction', address: '315 W 44th St' },
    { id: 9902, name: 'Guided walking/audio history tours', category_name: 'Attraction', address: '1 Centre Street, New York, NY 10007' },
    { id: 672, name: 'Sample Bar', category_name: 'Restaurant', address: 'Upper West Side, New York, NY' },
  ],
  thingOverrides: {},
}, { tripId: 99 });
assert.equal(regression.pass, false);
assert.ok(regression.failures.length >= 3);

console.log('test_issue_901_trip99_single_venue_standins: ok');
