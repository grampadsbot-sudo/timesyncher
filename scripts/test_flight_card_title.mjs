#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  formatFlightCardTitle,
  stripFlightScheduleFromTitle,
} from '../src/vacation/thing-title-normalize.mjs';
import { applyFlightThingFields } from '../src/vacation/shared-trip-flight-merge.mjs';
import { FLIGHT_CARD_TITLE_FN, patchVk994FlightTitles } from '../src/vacation/trek-vk-994-flight-title-patch.mjs';

const cases = [
  ['JetBlue LAS-JFK 2026-06-23 23:59-08:04+1', 'JetBlue LAS to JFK'],
  ['Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13', 'Delta LAS to JFK'],
  ['Southwest LAS-LGA 2026-06-23 05:05-15:45', 'Southwest LAS to LGA'],
  ['American Airlines LAS → JFK', 'American Airlines LAS to JFK'],
  ['United LAS-EWR 2026-06-23 07:00-15:00', 'United LAS to EWR'],
  ['Coastal Air PDX to BOS', 'Coastal Air PDX to BOS'],
];
const browserTitle = new Function(`${FLIGHT_CARD_TITLE_FN}; return tsFlightCardTitle;`)();
for (const [raw, expected] of cases) {
  assert.equal(formatFlightCardTitle(raw), expected, raw);
  assert.equal(browserTitle(raw), expected, `bundle ${raw}`);
}
assert.equal(browserTitle('JetBlue 2026-06-23', { route: 'LAS-JFK' }), formatFlightCardTitle('JetBlue 2026-06-23', { route: 'LAS-JFK' }));
assert.equal(browserTitle('Nonstop', { airline: 'Delta', blob: 'Route: LAS-JFK;' }), formatFlightCardTitle('Nonstop', { airline: 'Delta', blob: 'Route: LAS-JFK;' }));
assert.match(stripFlightScheduleFromTitle('United LAS-EWR 2026-06-23 07:00-15:00'), /^United LAS-EWR$/);

const place = {
  id: 652,
  name: 'JetBlue LAS-JFK 2026-06-23 23:59-08:04+1',
  category_name: 'Flight',
  category: { name: 'Flight' },
  description: 'Airline: JetBlue; Route: LAS-JFK;',
};
const override = { category: 'flight' };
applyFlightThingFields(place, override, { summary: place.description });
assert.equal(place.name, 'JetBlue LAS-JFK 2026-06-23 23:59-08:04+1', 'served payload title stays as stored');

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.ok(bundle.includes('function tsFlightCardTitle('), 'committed bundle carries flight title formatter');
assert.equal(patchVk994FlightTitles(bundle), bundle, 'flight title patch is idempotent on committed bundle');

console.log('test_flight_card_title: ok');
