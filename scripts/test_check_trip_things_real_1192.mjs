#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  carTitleNamesRentalBrand,
  flightTitleHasRealFlight,
  normalizeKey,
  tripThingGateViolations,
  tripThingHasAdmissibleProvenance,
  tripThingsRealGatePasses,
} from '../src/vacation/intake-thing-admission.mjs';
import {
  formatTripThingsRealReport,
  tripThingGateViolations as gateViolationsFromCli,
  tripThingsRealGatePasses as gatePassesFromCli,
} from './check_trip_things_real.mjs';
import {
  lopezBadPhraseRows,
  lopezGoodCustomerPlaceholder,
  lopezItineraryPhraseTitles,
} from './fixtures/lopez-intake-phrase-rows.mjs';

assert.equal(normalizeKey('Lake Buena Vista hotel'), 'lake buena vista hotel');
assert.equal(carTitleNamesRentalBrand('Hertz rental Orlando'), true);
assert.equal(flightTitleHasRealFlight('AA 1234'), true);
assert.equal(tripThingHasAdmissibleProvenance(lopezGoodCustomerPlaceholder), true);
const lopezViolations = tripThingGateViolations(lopezBadPhraseRows, { itineraryTitles: lopezItineraryPhraseTitles });
assert.match(formatTripThingsRealReport(lopezViolations), /composed|defect/);
assert.equal(gatePassesFromCli([lopezGoodCustomerPlaceholder]), true);
assert.ok(gateViolationsFromCli(lopezBadPhraseRows).length > 0);
assert.ok(lopezViolations.length > 0, 'lopez fixture must fail gate');
const codes = new Set(lopezViolations.map((row) => row.code));
assert.ok(codes.has('composed_or_assistant_phrase') || codes.has('defect_j_flight_phrase'), 'lopez flight/phrase violations');
assert.ok(codes.has('defect_a_duplicate') || lopezViolations.some((row) => row.code === 'defect_a_duplicate'), 'defect A dup');

const goodOnly = tripThingsRealGatePasses([lopezGoodCustomerPlaceholder]);
assert.equal(goodOnly, true, 'unfilled customer blurb event passes gate');

const requiredIiFail = tripThingsRealGatePasses([
  { id: 'x', title: 'Delta or Southwest early departure flight option', category: 'flight', metadata: { source: 'chat_extraction' } },
]);
assert.equal(requiredIiFail, false);

assert.equal(
  tripThingsRealGatePasses([
    { id: '1', title: 'Magic Kingdom parade', category: 'activity', metadata: { source: 'customer-turn' } },
    { id: '2', title: 'Magic Kingdom afternoon parade', category: 'activity', metadata: { source: 'customer-turn' } },
  ]),
  false,
  'defect H duplicate fails gate',
);

console.log('test_check_trip_things_real_1192: ok');