#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { GATE_B_INCOMPLETE_CONTRACT_ROW_IDS } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { searchPlaceOutputAcknowledgedViolations } from '../src/vacation/search-place-output.mjs';

const snapshot = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);
const trip = buildNycCraigKimDaybydayTrip();
const failures = [];

for (const [id, place] of Object.entries(snapshot)) {
  if (GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(Number(id))) continue;
  const violations = searchPlaceOutputAcknowledgedViolations(place);
  if (violations.length) failures.push(`DATA-CONTRACT: row ${id} ${violations.join(',')}`);
  const override = trip.thingOverrides[`place:${id}`] || {};
  if (place.price != null && override.price != null && override.price !== place.price) {
    failures.push(`DATA-CONTRACT: row ${id} price mismatch`);
  }
  if (place.logoUrl && override.logoUrl && override.logoUrl !== place.logoUrl) {
    failures.push(`DATA-CONTRACT: row ${id} logo mismatch`);
  }
  if (place.lat != null && override.lat != null && Math.abs(place.lat - override.lat) > 0.0001) {
    failures.push(`DATA-CONTRACT: row ${id} lat mismatch`);
  }
  for (let index = 1; index <= 4; index += 1) {
    const key = `review${index}`;
    const snapBody = place.sourceRecord?.[key];
    if (snapBody && override[key] && override[key] !== snapBody) {
      failures.push(`DATA-CONTRACT: row ${id} ${key} mismatch`);
    }
  }
}

if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('vk_contract_check (local): no DATA-CONTRACT lines');
