#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NYC_GATE_B_TRIP_ID } from '../src/vacation/shared-trip-dossier-keys.mjs';
import { saveThingEvidenceDossier, tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';

const recordedDir = fileURLToPath(new URL('./fixtures/xai-grok-pr336-gate-b-recorded/', import.meta.url));

const ROW_BY_CCAB = {
  Carbone: 610,
  "Zabar's": 602,
  'Strand Book Store': 605,
};

function pagesFromRecorded(record) {
  const pages = [];
  const seen = new Set();
  for (const block of record?.response?.output || []) {
    for (const item of block?.content || []) {
      if (item?.type !== 'output_text') continue;
      let parsed;
      try {
        parsed = JSON.parse(item.text);
      } catch {
        continue;
      }
      for (const site of parsed?.otherSites || []) {
        const url = site?.url;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        pages.push({
          url,
          fetchedAt: record.recordedAt || new Date().toISOString(),
          text: item.text.slice(0, 8000),
        });
      }
    }
  }
  if (!pages.length && record?.structuredText) {
    pages.push({
      url: record.ccabKey || 'recorded',
      fetchedAt: record.recordedAt || new Date().toISOString(),
      text: String(record.structuredText).slice(0, 8000),
    });
  }
  return pages;
}

async function main() {
  const files = readdirSync(recordedDir).filter((f) => f.endsWith('.json'));
  let seeded = 0;
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(recordedDir, file), 'utf8'));
    const rowId = ROW_BY_CCAB[record.ccabKey];
    if (!rowId) continue;
    const pages = pagesFromRecorded(record);
    if (!pages.length) continue;
    const key = tripPlaceDossierKey(NYC_GATE_B_TRIP_ID, rowId);
    await saveThingEvidenceDossier(key, {
      thing: record.title || record.ccabKey,
      pages,
      attempts: [{ kind: 'seed', status: 'ok', via: 'xai-grok-pr336-recorded', file }],
      fields: {},
    });
    seeded += 1;
  }
  console.log(JSON.stringify({ ok: true, seeded }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: String(error?.message || error) }));
  process.exit(1);
});
