#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  containsIntakePresentationStub,
  intakePresentationStubMatch,
  isPreservedEvidenceNarrative,
  isStructuredFlightNarrative,
  scanIntakePresentationStubs,
} from '../src/vacation/dossier-intake-presentation-strip.mjs';

const amelieStub =
  'West Village French bistro with strong wine list; reservations recommended on Friday nights. Price: $65 dinner prix fixe floor; Status: candidate only.';
assert.ok(containsIntakePresentationStub(amelieStub, { category: 'restaurant' }));
assert.equal(intakePresentationStubMatch(amelieStub, { category: 'restaurant' })?.reason, 'price_floor_and_status_candidate');

const factualProse =
  'The house tasting menu runs about $65 per person and candidate dishes change weekly; still one of the best wine lists on the block.';
assert.equal(containsIntakePresentationStub(factualProse, { category: 'restaurant' }), false);

const legitimatePrice = 'Entrees land around $42–$48 and the guacamole is worth ordering for the table.';
assert.equal(containsIntakePresentationStub(legitimatePrice, { category: 'restaurant' }), false);

const flightLedger =
  'Airline: Delta; Route: LAS-JFK; Stops: nonstop; Price: $257 Main Basic / $367 Main Classic; Status: candidate only; not booked.';
assert.ok(isStructuredFlightNarrative(flightLedger));
assert.equal(containsIntakePresentationStub(flightLedger, { category: 'flight' }), false);

const flightOptionLedger =
  'Flight option: American LAS-JFK 2026-06-23 12:37-20:59; Price: $257 floor; Status: candidate only.';
assert.equal(
  intakePresentationStubMatch(flightOptionLedger, { category: 'flight' })?.reason,
  'flight_option_intake_ledger',
);

const documentedOption =
  'Documented harbor cruise option for skyline views; compare single-ticket vs bundle. Price: $45 sightseeing cruise floor; Status: candidate only.';
assert.equal(intakePresentationStubMatch(documentedOption)?.reason, 'documented_option_intake');

const sourceEmail =
  'Source email: Estiatorio Milos Restaurant at Hudson Yards. Compare against lower-effort pizza/market options if the day is already packed.';
assert.equal(isPreservedEvidenceNarrative(sourceEmail), false);
assert.equal(containsIntakePresentationStub(sourceEmail), false);

const stubWithSourceEmailTail =
  'Source email: Famous Original Ray\'s Pizza. Price: $22 slice floor; Status: candidate only.';
assert.ok(containsIntakePresentationStub(stubWithSourceEmailTail));

const shared = {
  places: [{ id: 670, name: 'Amelie Bistro & Wine Bar', category: 'restaurant', details: amelieStub }],
  thingOverrides: {
    'place:671': {
      category: 'restaurant',
      description: 'Clean dossier body.',
      longDetails: 'Clean dossier body with enough words for UI.',
      details: amelieStub,
      sourceRecord: { category: 'restaurant', summary: 'West Village French bistro; Price: $65 prix fixe floor.' },
      fields: {
        itineraryNote: { value: 'Friday wine bar pick; Status: candidate only.' },
      },
    },
    'place:651': {
      category: 'flight',
      details: flightLedger,
    },
  },
};

const scan = scanIntakePresentationStubs(shared);
assert.equal(scan.pass, false);
assert.ok(scan.matchCount >= 4);
const paths = new Set(scan.matches.map((m) => m.path));
assert.ok(paths.has('places[670].details'));
assert.ok(paths.has('thingOverrides.place:671.details'));
assert.ok(paths.has('thingOverrides.place:671.sourceRecord.summary'));
assert.ok(paths.has('thingOverrides.place:671.fields.itineraryNote.value'));
assert.ok(!scan.matches.some((m) => m.placeId === '651'));

const cleanShared = {
  places: [{ id: 1, name: 'Clean Place', category: 'restaurant', description: factualProse }],
  thingOverrides: { 'place:1': { category: 'restaurant', description: factualProse } },
};
const cleanScan = scanIntakePresentationStubs(cleanShared);
assert.equal(cleanScan.pass, true);
assert.equal(cleanScan.matchCount, 0);

console.log('intake presentation stub scan tests passed');
