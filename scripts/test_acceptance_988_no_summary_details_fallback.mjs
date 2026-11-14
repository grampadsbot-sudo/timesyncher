#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { mergeWebDetailIntoSearchPlace } from '../src/vacation/search-place-detail-enrichment.mjs';
import { applyEnrichedDetailToTripThing } from '../src/vacation/place-detail-enrichment.mjs';
import { enrichTripThing } from '../src/vacation/trip-thing-enrich-row.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { buildNycCraigKimDaybydayTripPositiveV1 } from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import { gateBNycFixturePayloadSha256 } from './lib/gate-b-nyc-fixture-contract.mjs';

const NYC_PAYLOAD_SHA256 = '22834db13bb4078aa934d415aad6a7acb72d236d4fbe10cadfa95610179f9166';

const summaryOnly = 'Essence ladder summary only — compact tagline for the place.';

const merged = mergeWebDetailIntoSearchPlace(
  { title: 'Sample Hotel', category: 'hotel', description: '' },
  { detail: { summary: summaryOnly, category: 'hotel' }, detailEnriched: false },
);
assert.notEqual(String(merged.longDetails || '').trim(), summaryOnly);
if (String(merged.longDetails || '').trim() && String(merged.summary || '').trim()) {
  assert.notEqual(merged.longDetails, merged.summary);
}

const applied = applyEnrichedDetailToTripThing(
  { title: 'Sample Restaurant', description: '', metadata: {} },
  {
    detail: { summary: summaryOnly },
    sourceRecord: {},
    missingDetailFields: ['longDetails'],
    detailEnriched: false,
  },
);
assert.notEqual(String(applied.description || '').trim(), summaryOnly);

const enrichedRow = enrichTripThing({
  category: 'hotel',
  title: 'Hotel Lucerne',
  description: 'Documented NYC option (hotel)',
  metadata: { sourceRecord: { url: 'https://www.thelucernehotel.com/', price: 530 } },
});
const record = enrichedRow.metadata?.sourceRecord || {};
if (record.summary && record.description) {
  assert.notEqual(record.summary, record.description, 'enrichTripThing must not seed summary from description');
}
assert.notEqual(String(record.summary || '').trim(), String(record.description || '').trim());

const hotelNarrative =
  'Hotel Edison sits in the Times Square theater district with a classic 1930s lobby, strong Broadway foot traffic, and compact Midtown rooms that trade space for location.';
const genericSummary = 'Documented NYC option (hotel)';
const liveTrip = applyLiveAppListRowFields({
  places: [{
    id: 616,
    name: 'Hotel Edison',
    category_name: 'hotel',
    description: hotelNarrative,
    metadata: { sourceRecord: {} },
  }],
  thingOverrides: {
    'place:616': {
      summary: genericSummary,
      description: genericSummary,
    },
  },
});
const hotelOverride = liveTrip.thingOverrides['place:616'] || {};
assert.equal(String(hotelOverride.summary || '').trim(), genericSummary);
assert.ok(String(hotelOverride.longDetails || '').trim().length >= 40);
assert.notEqual(String(hotelOverride.summary || '').trim(), String(hotelOverride.longDetails || '').trim());

function collectFilesUnder(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) files.push(...collectFilesUnder(abs));
    else if (ent.isFile()) files.push(abs);
  }
  return files;
}

function grepLinesInPaths(paths, pattern) {
  const re = new RegExp(pattern);
  const hits = [];
  for (const file of paths) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) hits.push(`${file}:${i + 1}:${lines[i]}`);
    }
  }
  return hits.join('\n').trim();
}

const srcRoot = new URL('../src/vacation/', import.meta.url);
const vacationFiles = collectFilesUnder(srcRoot.pathname);
const grepOut = grepLinesInPaths(vacationFiles, '\\|\\|\\s*detail\\.summary');
assert.equal(grepOut, '', `must not copy detail.summary into longDetails/details paths:\n${grepOut}`);

const tripThingEnrichPath = new URL('../src/vacation/trip-thing-enrich-row.mjs', import.meta.url).pathname;
const dualSeed = grepLinesInPaths([tripThingEnrichPath], 'summary:\\s*description,\\s*description');
assert.equal(dualSeed, '', 'trip-thing-enrich-row must not seed summary and description from the same text');

const payloadSha = gateBNycFixturePayloadSha256(buildNycCraigKimDaybydayTripPositiveV1());
assert.equal(payloadSha, NYC_PAYLOAD_SHA256, 'NYC positive fixture payload hash must stay stable');

for (const script of [
  'scripts/test_vk_hotel_detail_fill.mjs',
  'scripts/test_claim_support_filler_summary.mjs',
  'scripts/test_finalize_served_payload_idempotent.mjs',
]) {
  execFileSync('node', [new URL(`../${script}`, import.meta.url).pathname], {
    stdio: 'pipe',
  });
}

console.log('acceptance #988: no summary-into-details fill fallbacks passed');
