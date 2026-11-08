#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { itineraryLineText } from '../src/vacation/itinerary-line.mjs';
import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';

const bundlePath = fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url));
const bundle = readFileSync(bundlePath, 'utf8');

assert.match(
  bundle,
  /if\(Qi&&bn\(wn\)&&Ds\(wn\)&&\/flight\/i\.test\(wn\.name\|\|""\)\)/,
  'day timeline must synthesize airport travel only for timeline-picked flights',
);
assert.doesNotMatch(
  bundle,
  /return bn\(G\)\?String\(Re\)\.replace\(\/\^\\s\*Flight option:/,
  'visible flight titles must not strip Flight option: in mr()',
);
assert.match(
  bundle,
  /mr=G=>\{var tsOv,tsPl,tsPid;tsPid=G&&\(G\.place_id/,
  'mr() must bind visible title from catalog place name, not reservation title',
);
assert.doesNotMatch(
  bundle,
  /\?void 0:zt\.title\)\?\?\(G\.title\|\|G\.name/,
  'mr() must not fall back to reservation title',
);

const trip = applyLiveAppListRowFields({
  places: [
    {
      id: 651,
      name: 'Delta LAS-JFK 2026-06-23 07:05-15:13',
      category_name: 'Flight',
      itineraryNote: '  Predawn leg note.  ',
    },
  ],
  thingOverrides: {
    'place:651': {
      category: 'flight',
      summary: 'Documented NYC option (flight) Airline: Delta; Route: LAS-JFK; Stops: nonstop;',
      longDetails:
        'Documented NYC option (flight) Airline: Delta; Route: LAS-JFK; Stops: nonstop; Status: candidate only; not booked.',
    },
  },
});

assert.equal(trip.places[0].name, 'Delta LAS-JFK 2026-06-23 07:05-15:13');
const ov = trip.thingOverrides['place:651'];
assert.equal(
  itineraryLineText(ov),
  'Predawn leg note.',
  'visible itinerary line must equal stored itineraryNote when present',
);
assert.ok(!String(ov.summary || '').includes('Documented'), 'list pipeline stub prefix must be stripped from summary');
assert.ok(!String(ov.longDetails || '').includes('Documented'), 'list pipeline stub prefix must be stripped from longDetails');

const gateBStubTrip = applyLiveAppListRowFields({
  places: [
    {
      id: 15,
      name: 'JetBlue LAS-JFK 2026-06-23 07:22-15:31',
      description: 'Documented NYC option (flight)',
      category_name: 'Flight',
    },
  ],
  thingOverrides: {
    'place:15': {
      category: 'flight',
      timeline: false,
      summary: 'Documented NYC option (flight) Airline: JetBlue; Route: LAS-JFK; Stops: nonstop;',
      longDetails:
        'Documented NYC option (flight) Airline: JetBlue; Route: LAS-JFK; Stops: nonstop; Status: candidate only; not booked.',
    },
  },
});
const jetblueRow = gateBStubTrip.places.find((place) => place.id === 15);
assert.ok(jetblueRow, 'stub flight place must exist');
assert.doesNotMatch(String(jetblueRow.name), /^Flight option:/i, 'stored flight name must not carry Flight option: prefix');
assert.equal(jetblueRow.description, '', 'pipeline Documented option stub must clear place.description');
assert.equal(rowSummary(jetblueRow, gateBStubTrip), '', 'stub must not backfill list row description from summary/longDetails');

console.log('issue #832 day-by-day flight placeholder guards passed');
