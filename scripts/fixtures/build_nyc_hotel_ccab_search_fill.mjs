#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isGenericDescription } from '../../src/vacation/trip-thing-enrichment.mjs';
import { enrichListRowFromStoredCcabTitle } from './pr336-vk-search-trip-sources.mjs';

const enrichment = JSON.parse(
  readFileSync(new URL('./nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);

const hotels = Object.entries(enrichment).filter(
  ([, record]) => String(record?.category || '').toLowerCase() === 'hotel',
);

const snapshot = {};
const failures = [];
for (const [ccabKey] of hotels) {
  const enriched = enrichListRowFromStoredCcabTitle(ccabKey, 'hotel');
  if (!enriched) {
    failures.push(`no enrich result for ${ccabKey}`);
    continue;
  }
  const description = String(enriched.description || '').trim();
  if (!description || isGenericDescription(description) || description.length < 40) {
    failures.push(`thin description for ${ccabKey}`);
  }
  snapshot[ccabKey] = enriched;
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const outPath = fileURLToPath(new URL('./nyc-hotel-vk-search-fill.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, hotels: hotels.length, wrote: outPath }, null, 2));
