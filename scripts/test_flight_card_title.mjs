#!/usr/bin/env node
import assert from 'node:assert/strict';

import { dossierThingTitle } from '../src/vacation/dossier-brave-queries.mjs';
import {
  formatFlightCardTitle,
  stripFlightScheduleFromTitle,
} from '../src/vacation/thing-title-normalize.mjs';
import { applyFlightThingFields } from '../src/vacation/shared-trip-flight-merge.mjs';

assert.equal(
  formatFlightCardTitle('JetBlue LAS-JFK 2026-06-23 23:59-08:04+1'),
  'JetBlue LAS to JFK',
);
assert.equal(
  formatFlightCardTitle('Flight option: Delta LAS-JFK 2026-06-23 07:05-15:13'),
  'Delta LAS to JFK',
);
assert.equal(
  formatFlightCardTitle('Southwest LAS-LGA 2026-06-23 05:05-15:45'),
  'Southwest LAS to LGA',
);
assert.equal(
  formatFlightCardTitle('American Airlines LAS → JFK'),
  'American Airlines LAS to JFK',
);
assert.equal(formatFlightCardTitle('Coastal Air PDX to BOS'), 'Coastal Air PDX to BOS');
assert.equal(
  dossierThingTitle({
    category: 'flight',
    title: 'Flight option: Coastal Air PDX to BOS',
  }),
  'Coastal Air PDX to BOS',
);

const scrubbed = stripFlightScheduleFromTitle('United LAS-EWR 2026-06-23 07:00-15:00');
assert.match(scrubbed, /^United LAS-EWR$/);

const cases = [
  ['JetBlue LAS-JFK 2026-06-23 23:59', /^\d{4}-\d{2}-\d{2}/],
  ['Delta LAS-JFK 2026-06-23 07:05-15:13', /\d{1,2}:\d{2}/],
];
for (const [raw, forbidden] of cases) {
  const out = formatFlightCardTitle(raw);
  assert.doesNotMatch(out, forbidden, raw);
}

const place = {
  id: 652,
  name: 'JetBlue LAS-JFK 2026-06-23 23:59-08:04+1',
  category_name: 'Flight',
  category: { name: 'Flight' },
  description: 'Airline: JetBlue; Route: LAS-JFK;',
};
const override = { category: 'flight' };
applyFlightThingFields(place, override, { summary: place.description });
assert.equal(place.name, 'JetBlue LAS to JFK');
assert.equal(override.name, 'JetBlue LAS to JFK');

console.log('test_flight_card_title: ok');