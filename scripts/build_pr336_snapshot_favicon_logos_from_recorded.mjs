#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyDiscoveredLogoToSnapshotRow,
  discoverPr336FaviconLogoFromRecording,
  listPr336FaviconLogoRecordings,
} from './lib/pr336-favicon-logo-recorded-lib.mjs';

const SNAPSHOT_PATH = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const counts = { bound: 0, noDeclaration: 0, transportFault: 0 };
  const applied = [];

  for (const fileName of listPr336FaviconLogoRecordings()) {
    const discovered = await discoverPr336FaviconLogoFromRecording(fileName);
    const key = String(discovered.rowId);
    const row = snapshot[key];
    if (!row) throw new Error(`missing snapshot row ${discovered.rowId}`);
    snapshot[key] = applyDiscoveredLogoToSnapshotRow(row, discovered);
    if (discovered.logoUrl && discovered.logoProvenance) {
      counts.bound += 1;
      applied.push({ rowId: discovered.rowId, outcome: 'bound', logoUrl: discovered.logoUrl, recording: fileName });
    } else if (/page_fetch_failed|page_http_|redirect_not|page_read_failed|EAI_AGAIN|ENOTFOUND|timeout/i.test(discovered.logoCaptureReason)) {
      counts.transportFault += 1;
      applied.push({ rowId: discovered.rowId, outcome: 'transport_fault', reason: discovered.logoCaptureReason, recording: fileName });
    } else {
      counts.noDeclaration += 1;
      applied.push({ rowId: discovered.rowId, outcome: 'no_declaration', reason: discovered.logoCaptureReason, recording: fileName });
    }
  }

  writeFileSync(SNAPSHOT_PATH, encode(snapshot));
  console.log(JSON.stringify({ snapshotPath: SNAPSHOT_PATH, counts, applied }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
