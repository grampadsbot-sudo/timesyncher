#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { stripFlightOptionPrefix } from '../src/vacation/shared-trip-flight-merge.mjs';
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

const trip = applyLiveAppListRowFields({
  places: [
    {
      id: 651,
      name: 'Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13',
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

assert.equal(trip.places[0].name, stripFlightOptionPrefix('Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13'));
const ov = trip.thingOverrides['place:651'];
assert.equal(
  itineraryLineText(ov),
  'Predawn leg note.',
  'visible itinerary line must equal stored itineraryNote when present',
);
assert.ok(!String(ov.summary || '').includes('Documented'), 'list pipeline stub prefix must be stripped from summary');
assert.ok(!String(ov.longDetails || '').includes('Documented'), 'list pipeline stub prefix must be stripped from longDetails');

const gateBFixturePath = '/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json';
const gateBBytes = readFileSync(gateBFixturePath);
const { served: gateBTrip } = prepareFixtureReplaySharedTrip(gateBBytes);
const jetblueRow = gateBTrip.places.find((place) => place.id === 15);
assert.ok(jetblueRow, 'Gate B fixture place 15 must exist');
assert.doesNotMatch(String(jetblueRow.name), /^Flight option:/i, 'replay must strip authorized Flight option: prefix from stored flight name');
assert.equal(rowSummary(jetblueRow, gateBTrip), '', 'pipeline Documented option stub must not render as flight list description');

console.log('issue #832 day-by-day flight placeholder guards passed');
