#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const GATE_B_CAPTURE_BIND_ROW_IDS = new Set([
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611,
]);
const GATE_B_INCOMPLETE_CONTRACT_ROW_IDS = new Set([608]);

const snapshot = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);
const trip = buildNycCraigKimDaybydayTrip();
const failures = [];

for (const id of GATE_B_CAPTURE_BIND_ROW_IDS) {
  if (GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(id)) continue;
  const key = String(id);
  const place = snapshot[key];
  if (!place || typeof place !== 'object') {
    failures.push(`DATA-CONTRACT: snapshot row ${key} missing`);
    continue;
  }
  const override = trip.thingOverrides[`place:${key}`] || {};
  if (!place.summary) failures.push(`DATA-CONTRACT: row ${key} blank_summary`);
  if (!place.description) failures.push(`DATA-CONTRACT: row ${key} blank_description`);
  if (place.price != null && override.price != null && override.price !== place.price) {
    failures.push(`DATA-CONTRACT: row ${key} price mismatch`);
  }
  if (place.logoUrl && override.logoUrl && override.logoUrl !== place.logoUrl) {
    failures.push(`DATA-CONTRACT: row ${key} logo mismatch`);
  }
  for (let index = 1; index <= 4; index += 1) {
    const reviewKey = `review${index}`;
    const snapBody = place.sourceRecord?.[reviewKey];
    if (snapBody && override[reviewKey] && override[reviewKey] !== snapBody) {
      failures.push(`DATA-CONTRACT: row ${key} ${reviewKey} mismatch`);
    }
  }
}

if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('vk_contract_check (local): no DATA-CONTRACT lines');
