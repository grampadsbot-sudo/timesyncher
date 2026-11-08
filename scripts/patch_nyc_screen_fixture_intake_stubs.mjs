#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripIntakePresentationFragments } from '../src/vacation/dossier-intake-presentation-strip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = path.join(root, 'scripts/fixtures/nyc-screen-trip99-live-shared-api.json');
const NARRATIVE_KEYS = new Set(['summary', 'description', 'longDetails', 'details', 'itineraryNote']);

function categoryFromRow(row = {}) {
  const raw = row.category?.name || row.category_name || row.category;
  return String(raw || '').toLowerCase();
}

function scrubScalar(value, category) {
  const row = String(value ?? '');
  if (!row) return row;
  return stripIntakePresentationFragments(row, { category });
}

function scrubRecord(record, category) {
  if (!record || typeof record !== 'object') return 0;
  let changed = 0;
  for (const key of NARRATIVE_KEYS) {
    if (!(key in record)) continue;
    const next = scrubScalar(record[key], category);
    if (next && next !== record[key]) {
      record[key] = next;
      changed += 1;
    }
  }
  if (record.sourceRecord && typeof record.sourceRecord === 'object') {
    const srCat = categoryFromRow(record.sourceRecord) || category;
    changed += scrubRecord(record.sourceRecord, srCat);
  }
  return changed;
}

const beforeSha = createHash('sha256').update(await readFile(fixturePath)).digest('hex');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
let fieldChanges = 0;

for (const place of fixture.places || []) {
  fieldChanges += scrubRecord(place, categoryFromRow(place));
}

for (const [key, override] of Object.entries(fixture.thingOverrides || {})) {
  if (!key.startsWith('place:')) continue;
  const placeId = Number(key.slice('place:'.length));
  const place = (fixture.places || []).find((row) => row.id === placeId);
  const category = categoryFromRow(override) || categoryFromRow(place);
  fieldChanges += scrubRecord(override, category);
}

await writeFile(fixturePath, `${JSON.stringify(fixture, null, 1)}\n`);
const afterSha = createHash('sha256').update(await readFile(fixturePath)).digest('hex');
console.log(JSON.stringify({ fixturePath, beforeSha, afterSha, fieldChanges }, null, 2));
