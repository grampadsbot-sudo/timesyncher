#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { placesForCategoryTab } from '../apps/vacation-client/src/lib/listTabModel.mjs';

const bundlePath = fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url));
const bundle = readFileSync(bundlePath, 'utf8');
assert.match(
  bundle,
  /bn=G=>It\(G\)==="flight"\|\|Fn\(G\)==="flight"/,
  'served bundle must classify flight rows via bn() fallback to Fn()',
);

const trip = applyLiveAppListRowFields({
  places: [
    {
      id: 17,
      name: 'Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45',
      category_name: 'Transport',
      description: 'Documented NYC option (flight)',
      websiteCapture: { category: 'flight' },
    },
    {
      id: 99,
      name: 'Broadway show',
      category_name: 'Theatre',
    },
  ],
  thingOverrides: {
    'place:17': { category: 'transport', timeline: false },
  },
  reservations: [{ id: 17, place_id: 17, type: 'flight', title: 'Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45' }],
});

const flightRows = placesForCategoryTab(trip, 'flights');
const eventRows = placesForCategoryTab(trip, 'events');
assert.ok(flightRows.some((p) => String(p.id) === '17'), 'legacy transport flight duplicate must list under Flights');
assert.ok(!eventRows.some((p) => String(p.id) === '17'), 'legacy transport flight duplicate must not list under Events');
assert.equal(trip.places[0].name, 'Southwest LAS-LGA 2026-06-23 05:05-15:45');
assert.equal(trip.places[0].description, '');

console.log('issue #832 events flight classification checks passed');
