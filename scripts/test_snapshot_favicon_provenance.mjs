import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  discoverPr336FaviconLogoFromRecording,
  listPr336FaviconLogoRecordings,
} from './lib/pr336-favicon-logo-recorded-lib.mjs';

const SNAPSHOT = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);

function rowLogoUrl(row = {}) {
  return String(row.logoUrl || row.sourceRecord?.logoUrl || '').trim();
}

for (const [rowId, row] of Object.entries(SNAPSHOT)) {
  const logoUrl = rowLogoUrl(row);
  if (!/\/favicon\.ico$/i.test(logoUrl)) continue;
  const provenance = row.sourceRecord?.logoProvenance;
  assert.ok(provenance?.pageUrl, `row ${rowId} favicon.ico requires logoProvenance.pageUrl`);
  assert.equal(
    String(provenance.iconUrl || '').trim(),
    logoUrl,
    `row ${rowId} favicon.ico must match logoProvenance.iconUrl`,
  );
}

for (const fileName of listPr336FaviconLogoRecordings()) {
  const discovered = await discoverPr336FaviconLogoFromRecording(fileName);
  const row = SNAPSHOT[String(discovered.rowId)];
  assert.ok(row, `snapshot row ${discovered.rowId}`);
  const logoUrl = rowLogoUrl(row);
  if (discovered.logoUrl && discovered.logoProvenance) {
    assert.equal(logoUrl, discovered.logoUrl, `row ${discovered.rowId} logoUrl must match recording`);
    assert.deepEqual(row.sourceRecord?.logoProvenance, discovered.logoProvenance);
  } else {
    assert.equal(logoUrl, '', `row ${discovered.rowId} must be explicit no-logo`);
    assert.ok(row.sourceRecord?.logoCaptureReason, `row ${discovered.rowId} needs logoCaptureReason`);
  }
}

console.log('snapshot favicon provenance tests passed');
