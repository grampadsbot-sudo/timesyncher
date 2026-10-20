#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertCcabSearchPlaceProvenance,
  assertPr336GateBSnapshotWriteAllowed,
  buildGateBSearchPlaceForRow,
  buildPr336VkSearchPlacesByRowId,
  ccabSearchPlaceProvenanceViolations,
  rawSearchPlaceFromCcab,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { enrichSearchPlace } from '../src/vacation/trip-thing-enrichment.mjs';

const GATE_B_ROWS = [
  { day: 1, time: '10:30', name: 'JetBlue LAS → JFK', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Standard sedan', cat: 'car', id: 609, listOnly: true },
];

const literalRecord = {
  category: 'store',
  description: 'Fixture literal row with a stored shelf price for regression only.',
  price: 12,
  priceDerivationStatus: 'verified_product_quote',
  priceEvidenceUrl: 'https://example.test/menu',
  website: 'https://example.test/',
};

const literalPlace = enrichSearchPlace(rawSearchPlaceFromCcab({
  title: 'Literal fixture store',
  category: 'store',
  ccabKey: 'Literal fixture store',
  ccabRecord: literalRecord,
}));

assert.equal(literalPlace.source, 'prior_db', 'stored literals must not claim brave network origin');
assert.equal(literalPlace.sourceRecord.source, 'prior_db');
assert.equal(literalPlace.sourceRecord.ccabInputKind, 'stored_fixture_literal');
assert.equal(
  ccabSearchPlaceProvenanceViolations({
    ccabKey: 'Literal fixture store',
    ccabRecord: literalRecord,
    place: literalPlace,
  }).length,
  0,
  'literal importer output must self-validate when fields align',
);

const forgedBrave = enrichSearchPlace({
  source: 'brave',
  category: 'store',
  title: 'Forged brave row',
  externalId: 'Forged brave row',
  sourceRecord: {
    ...literalRecord,
    source: 'brave',
    ccabInputKind: 'stored_fixture_literal',
  },
});
assert.ok(
  ccabSearchPlaceProvenanceViolations({
    ccabKey: 'Forged brave row',
    ccabRecord: literalRecord,
    place: forgedBrave,
  }).includes('false_brave_network_origin'),
  'forged brave attribution on a literal must fail validation',
);

const capturedRecord = {
  category: 'restaurant',
  description: 'Recorded brave capture with a real menu price.',
  price: 24,
  priceDerivationStatus: 'verified_product_quote',
  priceEvidenceUrl: 'https://example.test/menu',
  website: 'https://example.test/',
  searchProviderCapture: {
    provider: 'brave',
    evidenceRef: 'fixture:brave-capture-demo-566',
  },
};
const capturedPlace = enrichSearchPlace(rawSearchPlaceFromCcab({
  title: 'Captured brave restaurant',
  category: 'restaurant',
  ccabKey: 'Captured brave restaurant',
  ccabRecord: capturedRecord,
}));
assert.equal(capturedPlace.source, 'brave');
assert.equal(capturedPlace.sourceRecord.searchProviderCapture.provider, 'brave');
assertCcabSearchPlaceProvenance({
  ccabKey: 'Captured brave restaurant',
  ccabRecord: capturedRecord,
  place: capturedPlace,
});

assert.throws(
  () => assertCcabSearchPlaceProvenance({
    ccabKey: 'bad capture',
    ccabRecord: { searchProviderCapture: { provider: 'brave' }, price: 10, category: 'store' },
    place: enrichSearchPlace(rawSearchPlaceFromCcab({
      title: 'bad capture',
      ccabKey: 'bad capture',
      ccabRecord: { searchProviderCapture: { provider: 'brave' }, price: 10, category: 'store' },
    })),
  }),
  /forged_search_provider_capture/,
  'brave capture without evidence ref must be rejected',
);

const row609 = buildGateBSearchPlaceForRow({ id: 609, name: 'Priceline opaque Standard sedan', cat: 'car' });
assert.equal(row609.source, 'prior_db');
assert.ok(row609.sourceRecord.identityProvenance, 'row 609 identity provenance must be retained');
assert.equal(
  row609.sourceRecord.identityProvenance.approvedDisplayTitle,
  'Priceline opaque Standard sedan',
);

const gateBPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
for (const row of GATE_B_ROWS) {
  assert.notEqual(gateBPlaces[row.id].source, 'brave', `row ${row.id} must not falsely claim brave`);
}
assert.throws(
  () => assertPr336GateBSnapshotWriteAllowed(gateBPlaces, GATE_B_ROWS),
  /pr336 gate-b snapshot write blocked/,
  'canonical gate-b literals must fail closed before snapshot write',
);

console.log('SOURCE-PROVENANCE-566 PASS', JSON.stringify({
  literal_source: literalPlace.source,
  captured_brave_source: capturedPlace.source,
  gate_b_rows: GATE_B_ROWS.length,
  snapshot_write_blocked: true,
}));
