#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
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
import { LOPEZ_PROVENANCE_CONTEXT } from './fixtures/lopez-intake-customer-turns.mjs';

const ctx = LOPEZ_PROVENANCE_CONTEXT;

assert.equal(tripThingHasAdmissibleProvenance(lopezGoodCustomerPlaceholder, ctx), true);
const lopezViolations = tripThingGateViolations(lopezBadPhraseRows, { itineraryTitles: lopezItineraryPhraseTitles, provenanceContext: ctx });
assert.match(formatTripThingsRealReport(lopezViolations), /invalid_provenance|defect/);
assert.equal(tripThingsRealGatePasses([lopezGoodCustomerPlaceholder], { provenanceContext: ctx }), true);
assert.ok(gateViolationsFromCli(lopezBadPhraseRows, { provenanceContext: ctx }).length > 0);
assert.ok(lopezViolations.length > 0, 'lopez fixture must fail gate');
const codes = new Set(lopezViolations.map((row) => row.code));
assert.ok(codes.has('invalid_provenance') || codes.has('defect_j_flight_without_provenance'), 'lopez flight/provenance violations');

const goodOnly = tripThingsRealGatePasses([lopezGoodCustomerPlaceholder], { provenanceContext: ctx });
assert.equal(goodOnly, true, 'unfilled customer blurb event passes gate');

const requiredIiFail = tripThingsRealGatePasses([
  { id: 'x', title: 'Delta or Southwest early departure flight option', category: 'flight', metadata: { source: 'chat_extraction' } },
], { provenanceContext: ctx });
assert.equal(requiredIiFail, false);

assert.equal(
  tripThingsRealGatePasses([
    {
      id: '1',
      title: 'Magic Kingdom parade',
      category: 'activity',
      metadata: { origin: 'customer_turn', customerTurnId: 'turn-parade', customerSpan: 'Magic Kingdom parade' },
    },
    {
      id: '2',
      title: 'Magic Kingdom afternoon parade',
      category: 'activity',
      metadata: { origin: 'customer_turn', customerTurnId: 'turn-parade', customerSpan: 'Magic Kingdom afternoon parade' },
    },
  ], { provenanceContext: ctx }),
  false,
  'defect H duplicate customer spans fail gate when both cited',
);

console.log('test_check_trip_things_real_1192: ok');