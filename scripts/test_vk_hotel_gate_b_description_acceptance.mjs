#!/usr/bin/env node
import assert from 'node:assert/strict';

import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import { enrichSearchPlace, isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';
import { gateBCapturePreDataCheck } from './ops/capture/capture-pre-data-check.mjs';
import { buildGateBSearchPlaceForRow } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { NYC_STAGING_CAPTURE_LIST_ROWS } from './fixtures/nyc-vk-list-tab-rows.mjs';

const MIN_HOTEL_DESC_CHARS = 40;

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const hotelRows = NYC_STAGING_CAPTURE_LIST_ROWS.filter((row) => row.cat === 'hotel');
for (const row of hotelRows) {
  const enriched = enrichSearchPlace(buildGateBSearchPlaceForRow(row));
  const description = text(enriched.description);
  assert.ok(description.length >= MIN_HOTEL_DESC_CHARS, `${row.name} description length ${description.length}`);
  assert.ok(!isGenericDescription(description), `${row.name} generic description`);
  assert.equal(
    descriptionPassesDetailJudge(description, enriched.title),
    true,
    `${row.name} must pass detail judge`,
  );
}

const trip = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
let hotelCount = 0;
for (const place of trip.places || []) {
  const override = trip.thingOverrides?.[`place:${place.id}`] || {};
  if (productThingCategory(place, override) !== 'hotel') continue;
  hotelCount += 1;
  const summary = text(override.summary || place.summary);
  const longDetails = text(override.longDetails || place.description);
  assert.ok(summary.length >= MIN_HOTEL_DESC_CHARS, `${place.name} summary length ${summary.length}`);
  assert.ok(longDetails.length >= MIN_HOTEL_DESC_CHARS, `${place.name} longDetails length ${longDetails.length}`);
  assert.ok(!isGenericDescription(longDetails), `${place.name} generic longDetails`);
  assert.equal(descriptionPassesDetailJudge(longDetails, place.name), true, `${place.name} judge`);
}

assert.equal(hotelCount, 22, `expected 22 hotels, got ${hotelCount}`);

const preData = await gateBCapturePreDataCheck(trip);
assert.equal(preData.pass, true, JSON.stringify(preData.failures, null, 2));

console.log(JSON.stringify({
  ok: true,
  ccabHotelRows: hotelRows.length,
  tripHotels: hotelCount,
  minDescriptionChars: MIN_HOTEL_DESC_CHARS,
}, null, 2));
