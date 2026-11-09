#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripIntakePresentationFragments } from '../../src/vacation/dossier-intake-presentation-strip.mjs';
const NARRATIVE_KEYS = ['summary', 'description', 'longDetails', 'details', 'itineraryNote'];

const TARGETS = [
  new URL('./nyc_ccab_place_enrichment.json', import.meta.url),
  new URL('./pr336-vk-search-places.snapshot.json', import.meta.url),
];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function categoryFromRow(row = {}) {
  const raw = row.category?.name || row.category_name || row.category;
  return text(raw, 40).toLowerCase();
}

function scrubObject(obj, category, stats) {
  if (!obj || typeof obj !== 'object') return 0;
  let rowChanged = 0;
  const cat = category || categoryFromRow(obj);
  for (const key of NARRATIVE_KEYS) {
    if (typeof obj[key] !== 'string' || !obj[key].trim()) continue;
    const next = stripIntakePresentationFragments(obj[key], { category: cat });
    if (next !== obj[key]) {
      obj[key] = next;
      rowChanged += 1;
      stats.fields += 1;
    }
  }
  if (obj.sourceRecord && typeof obj.sourceRecord === 'object') {
    rowChanged += scrubObject(obj.sourceRecord, categoryFromRow(obj.sourceRecord) || cat, stats);
  }
  return rowChanged;
}

let totalFields = 0;
for (const url of TARGETS) {
  const path = fileURLToPath(url);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const stats = { file: path, rows: 0, fields: 0 };
  for (const row of Object.values(data)) {
    if (!row || typeof row !== 'object') continue;
    const changed = scrubObject(row, categoryFromRow(row), stats);
    if (changed > 0) stats.rows += 1;
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  totalFields += stats.fields;
  console.log(JSON.stringify(stats));
}
console.log(JSON.stringify({ ok: true, totalFields }));
