#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createStoredCcabNarrativeMerge } from '../src/vacation/stored-ccab-narrative-merge.mjs';
import { buildGateBApprovedSharedTrip } from './fixtures/gate-b-approved-shared-trip.mjs';
import { scanIntakePresentationStubs } from '../src/vacation/dossier-intake-presentation-strip.mjs';

const stubPhrase = 'Price: $65 dinner prix fixe floor; Status: candidate only.';
const enrichment = {
  'Stub Bistro NYC': {
    category: 'restaurant',
    description: `West Village French bistro with strong wine list. ${stubPhrase}`,
    longDetails: `West Village French bistro with strong wine list. ${stubPhrase}`,
    summary: 'West Village French bistro.',
  },
};

const { mergeStoredCcabNarrativeIntoOverride } = createStoredCcabNarrativeMerge(enrichment);
const place = { id: 90901, name: 'Stub Bistro NYC', category_name: 'restaurant', description: 'thin' };
const merged = mergeStoredCcabNarrativeIntoOverride(place, {});
const servedDetails = text(merged.longDetails || merged.details || merged.description || '');
assert.match(servedDetails, /candidate only/i, 'serve merge must not rewrite stored scalar text');
assert.match(servedDetails, /prix fixe floor/i);

const trip = buildGateBApprovedSharedTrip();
const scan = scanIntakePresentationStubs(trip);
assert.equal(scan.matchCount, 0, `canonical trip must be stub-clean from source data only (got ${scan.matchCount})`);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

console.log('no-runtime intake presentation strip regression passed');
