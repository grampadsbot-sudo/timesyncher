#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
  GATE_B_INCOMPLETE_CONTRACT_ROW_IDS,
  NYC_GATE_B_ROW_CCAB_KEYS,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import {
  NYC_VK_ISSUE_429_LIST_ROWS,
  resolveNycCcabKey,
} from './fixtures/nyc-vk-list-tab-rows.mjs';
import { assertSearchPlaceOutputContract } from '../src/vacation/search-place-output.mjs';

const TIMELINE_ROWS = [
  { day: 1, time: '10:30', name: 'Flight option: JetBlue LAS-JFK 2026-06-23 07:22-15:31', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Toyota Corolla', cat: 'car', id: 609, listOnly: true },
];

function buildGateBRows() {
  const rows = [...TIMELINE_ROWS];
  const rowIdentity = (row) => `${row.ccabKey || resolveNycCcabKey(row.name)}\0${row.name}`;
  const seenRowIdentities = new Set(rows.map(rowIdentity));
  let nextListId = 612;
  for (const listRow of NYC_VK_ISSUE_429_LIST_ROWS) {
    const identity = `${listRow.ccabKey}\0${listRow.name}`;
    if (seenRowIdentities.has(identity)) continue;
    seenRowIdentities.add(identity);
    rows.push({
      day: 1,
      time: '11:00',
      name: listRow.name,
      cat: listRow.cat,
      id: nextListId,
      ccabKey: listRow.ccabKey,
      listOnly: true,
    });
    nextListId += 1;
  }
  return rows;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function mappableCategory(cat) {
  const c = text(cat).toLowerCase();
  return c !== 'flight' && c !== 'car';
}

function identityProvenanceOk(record = {}, title = '', externalId = '') {
  const prov = record.identityProvenance;
  if (!prov || typeof prov !== 'object') return false;
  return text(prov.approvedDisplayTitle) === text(title)
    && text(prov.ccabKey) === text(externalId)
    && Boolean(text(prov.evidenceUrl));
}

function hasRating(override = {}, record = {}) {
  return Boolean(
    text(override.googleRating || record.googleRating)
    || text(override.yelpRating || record.yelpRating)
    || text(override.thirdPartyRating || record.thirdPartyRating),
  );
}

function hasReviews(override = {}, record = {}) {
  return Boolean(text(override.review1 || record.review1));
}

function missingFieldsAllow(field, override = {}, record = {}) {
  const missing = override.missingFields || record.missingFields;
  return Array.isArray(missing) && missing.includes(field);
}

const snapshot = JSON.parse(
  readFileSync(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'),
);
const gateBRows = buildGateBRows();
const placesById = buildPr336VkSearchPlacesByRowId(gateBRows);
assertGateBRowProvenance(gateBRows, placesById);

for (const [id, expectedKey] of Object.entries(NYC_GATE_B_ROW_CCAB_KEYS)) {
  assert.equal(
    text(placesById[Number(id)]?.externalId),
    text(expectedKey),
    `row ${id} ccab externalId must match NYC_GATE_B_ROW_CCAB_KEYS`,
  );
}

const contractPlaces = gateBRows
  .filter((row) => !GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(row.id))
  .map((row) => placesById[row.id]);
assertSearchPlaceOutputContract(contractPlaces);

const descriptionOwners = new Map();
for (const [id, place] of Object.entries(snapshot)) {
  const description = text(place.description);
  if (!description) continue;
  if (!descriptionOwners.has(description)) descriptionOwners.set(description, []);
  descriptionOwners.get(description).push(id);
}
for (const [description, ids] of descriptionOwners) {
  assert.equal(
    ids.length,
    1,
    `description-duplicate: rows ${ids.join(',')} share ${description.slice(0, 80)}`,
  );
}

const trip = buildNycCraigKimDaybydayTrip();
const failures = [];

const GATE_B_TIMELINE_IDS = new Set([601, 602, 603, 604, 605, 606, 607, 610, 611]);
const GATE_B_LIST_FAULT_IDS = new Set([635, 636, 665]);

for (const place of trip.places) {
  const override = trip.thingOverrides[`place:${place.id}`] || {};
  const onTimeline = Boolean(override.timeline);
  const inScope = GATE_B_TIMELINE_IDS.has(place.id)
    || (onTimeline && GATE_B_TIMELINE_IDS.has(place.id))
    || GATE_B_LIST_FAULT_IDS.has(place.id);
  if (!inScope) continue;

  const search = snapshot[String(place.id)] || {};
  const record = search.sourceRecord && typeof search.sourceRecord === 'object'
    ? search.sourceRecord
    : {};
  const cat = text(override.category || place.category_name).toLowerCase();
  const label = `${place.id}:${place.name}`;

  if (GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(place.id)) {
    if (place.lat != null || place.lng != null) {
      failures.push(`identity: ${label} list-only blocked row must not carry coordinates`);
    }
    if (text(record.externalId || search.externalId) && text(place.name) !== text(search.title || place.name)) {
      if (!text(override.provenanceBlocker)) {
        failures.push(`identity: ${label} blocked hotel must document provenanceBlocker`);
      }
    }
    continue;
  }

  if (mappableCategory(cat)) {
    const lat = Number(place.lat ?? override.lat);
    const lng = Number(place.lng ?? override.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      failures.push(`coordinates: ${label}`);
    }
  }

  const externalId = text(search.externalId || record.externalId || place.name);
  const title = text(search.title || place.name);
  const normalizedIdentity = (value) => text(value).toLowerCase().replace(/['’]/g, "'");
  if (
    mappableCategory(cat)
    && externalId
    && title
    && normalizedIdentity(externalId) !== normalizedIdentity(title)
    && !identityProvenanceOk(record, title, externalId)
  ) {
    failures.push(`identity: ${label} title ${title} vs externalId ${externalId}`);
  }

  const needsRatings = !['flight', 'car'].includes(cat);
  if (needsRatings && !missingFieldsAllow('ratings', override, record) && !hasRating(override, record)) {
    failures.push(`ratings: ${label}`);
  }
  if (needsRatings && !missingFieldsAllow('reviews', override, record) && !hasReviews(override, record)) {
    failures.push(`reviews: ${label}`);
  }
}

assert.equal(failures.length, 0, failures.join('\n'));
console.log('test_vk_nyc_test_trip_data_contract: ok');
