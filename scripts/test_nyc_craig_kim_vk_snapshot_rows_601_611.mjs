#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  VK_SEARCH_SNAPSHOT_COPY_ROW_IDS,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const PR336_SEARCH_SNAPSHOT = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function renderedDescription(shared, place) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  return text(override.longDetails || place.description);
}

function renderedSummary(shared, place) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  return text(override.summary || place.summary);
}

const shared = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());

for (const rowId of VK_SEARCH_SNAPSHOT_COPY_ROW_IDS) {
  const snapshot = PR336_SEARCH_SNAPSHOT[String(rowId)];
  assert.ok(snapshot, `missing pr336 snapshot row ${rowId}`);
  const place = shared.places.find((p) => p.id === rowId);
  assert.ok(place, `built trip missing place ${rowId}`);

  assert.equal(text(place.name), text(snapshot.title), `${rowId} identity (place.name)`);
  assert.equal(renderedSummary(shared, place), text(snapshot.summary), `${rowId} summary`);
  assert.equal(renderedDescription(shared, place), text(snapshot.description), `${rowId} description`);
}

const flight601 = shared.thingOverrides['place:601'] || {};
assert.equal(flight601.price, 257, '601 keeps fixture price overlay');
assert.equal(flight601.logoUrl, 'https://www.aa.com/favicon.ico', '601 keeps fixture logo overlay');
assert.equal(shared.places.find((p) => p.id === 601)?.lat, 36.084, '601 keeps fixture coordinates');

console.log('nyc craig kim vk snapshot rows 601-611 binding tests passed');
