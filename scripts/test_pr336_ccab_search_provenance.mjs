import assert from 'node:assert/strict';
import { assertPr336GateBSnapshotWriteAllowed, buildGateBSearchPlaceForRow, rawSearchPlaceFromCcab } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { lineageRows, overlayDescriptionForCcabKey } from './lib/pr336-stored-narrative-lineage-lib.mjs';

const row = { id: 602, name: "Zabar's", cat: 'store' };
const literal = buildGateBSearchPlaceForRow(row);
assert.equal(literal.source, 'fixture');
assert.equal(literal.sourceRecord.source, 'fixture');
assert.equal(literal.sourceRecord.ccabInputKind, 'stored_fixture_literal');
assert.throws(() => assertPr336GateBSnapshotWriteAllowed({ 602: literal }, [row]), /source evidence unverified for rows 602/);
assert.throws(() => assertPr336GateBSnapshotWriteAllowed({}, [row]), /source evidence unverified for rows 602/);
assert.throws(() => assertPr336GateBSnapshotWriteAllowed({}, []), /snapshot write blocked/);

for (const label of ['brave', 'osm', 'tavily', 'prior_db']) {
  const record = { ...literal.sourceRecord, source: label, priceDerivationStatus: 'verified_product_quote', priceEvidenceUrl: 'https://example.test/menu', searchProviderCapture: { provider: label, evidenceRef: 'self-declared' } };
  const forged = rawSearchPlaceFromCcab({ title: literal.title, category: literal.category, ccabKey: literal.externalId, ccabRecord: record });
  assert.equal(forged.source, 'fixture');
  assert.equal(forged.sourceRecord.source, 'fixture');
  assert.equal(forged.sourceRecord.ccabInputKind, 'stored_fixture_literal');
  assert.equal(forged.sourceRecord.price, literal.sourceRecord.price);
  assert.equal(forged.sourceRecord.description, literal.sourceRecord.description);
  assert.throws(() => assertPr336GateBSnapshotWriteAllowed({ 602: forged }, [row]), /source evidence unverified for rows 602/);
}
assert.equal(buildGateBSearchPlaceForRow({ id: 609, name: 'Priceline opaque Standard sedan', cat: 'car' }).sourceRecord.identityProvenance.approvedDisplayTitle, 'Priceline opaque Standard sedan');

for (const lineage of lineageRows()) {
  assert.equal(lineage.providerBranch, 'stored_fixture_literal');
  assert.equal(lineage.builtDescription, lineage.overlayDescription);
  assert.equal(lineage.builtDescription, lineage.snapshotDescription);
  assert.equal(lineage.builtDescription, overlayDescriptionForCcabKey(lineage.ccabKey));
  assert.equal(
    buildGateBSearchPlaceForRow({ id: lineage.rowId, name: lineage.gateBName, cat: lineage.category }).description,
    lineage.builtDescription,
  );
}

console.log('SOURCE-PROVENANCE-566 PASS: actual literals, missing rows and self-declared provider/price evidence cannot become sourced snapshots');
console.log('NARRATIVE-LINEAGE-566 PASS: six gate-b rows trace overlay literals through enrichSearchPlace into snapshot');
