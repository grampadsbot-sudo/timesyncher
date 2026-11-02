#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { descriptionPassesDetailJudge } from '../../src/vacation/thing-detail-fields.mjs';
import { isGenericDescription } from '../../src/vacation/trip-thing-enrichment.mjs';
import { buildGateBSearchPlaceForRow } from './pr336-vk-search-trip-sources.mjs';
import { NYC_STAGING_CAPTURE_LIST_ROWS } from './nyc-vk-list-tab-rows.mjs';

const hotelRows = NYC_STAGING_CAPTURE_LIST_ROWS.filter((row) => row.cat === 'hotel');
const snapshot = {};
const failures = [];
for (const row of hotelRows) {
  const enriched = buildGateBSearchPlaceForRow(row);
  const description = String(enriched.description || '').trim();
  if (
    !description
    || isGenericDescription(description)
    || description.length < 40
    || !descriptionPassesDetailJudge(description, enriched.title)
  ) {
    failures.push(`thin description for row ${row.id} ${row.name}`);
    continue;
  }
  snapshot[row.ccabKey] = enriched;
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const outPath = fileURLToPath(new URL('./nyc-hotel-vk-search-fill.snapshot.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, hotels: hotelRows.length, wrote: outPath }, null, 2));
