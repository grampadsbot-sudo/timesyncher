#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  discoverCcabLogoFromRecording,
  effectiveCcabDeclaredLogoUrl,
  listCcabLogoRecordings,
} from './lib/nyc-ccab-declared-logo-recorded-lib.mjs';

const ENRICHMENT_PATH = fileURLToPath(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url));
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const enrichment = JSON.parse(readFileSync(ENRICHMENT_PATH, 'utf8'));
  const applied = [];
  for (const fileName of listCcabLogoRecordings()) {
    const discovered = await discoverCcabLogoFromRecording(fileName);
    const row = enrichment[discovered.ccabKey];
    if (!row) throw new Error(`missing ccab enrichment row ${discovered.ccabKey}`);
    const beforeLogo = row.logoUrl;
    row.logoUrl = discovered.logoUrl;
    row.logoProvenance = discovered.logoProvenance;
    if (!effectiveCcabDeclaredLogoUrl(row)) throw new Error(`effective logo empty after apply for ${discovered.ccabKey}`);
    applied.push({
      ccabKey: discovered.ccabKey,
      beforeLogo,
      afterLogo: discovered.logoUrl,
      pageSha256: discovered.pageSha256,
      iconSha256: discovered.iconSha256,
      recording: fileName,
    });
  }
  writeFileSync(ENRICHMENT_PATH, encode(enrichment));
  console.log(JSON.stringify({ enrichmentPath: ENRICHMENT_PATH, applied }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
