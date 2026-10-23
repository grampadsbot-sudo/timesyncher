#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildGateBApprovedSharedTrip } from './fixtures/gate-b-approved-shared-trip.mjs';
import { gateBCapturePreDataCheck } from './ops/capture/capture-pre-data-check.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';

function wordCount(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

const trip = buildGateBApprovedSharedTrip();
const overrides = trip.thingOverrides || {};

let hotels = 0;
let hotelDescPass = 0;
let flights = 0;
let cars = 0;
let hotelMissingUrls = 0;

for (const place of trip.places || []) {
  const override = overrides[`place:${place.id}`] || {};
  const category = productThingCategory(place, override);
  const price = override.price ?? place.price;
  const longDetails = override.longDetails || place.description || '';

  if (category === 'hotel') {
    hotels += 1;
    if (descriptionPassesDetailJudge(longDetails, place.name)) hotelDescPass += 1;
    const urls = override.summarySourceUrls;
    if (!Array.isArray(urls) || !urls.length) hotelMissingUrls += 1;
    assert.ok(price != null && price !== '', `${place.name} missing hotel price`);
    assert.ok(wordCount(longDetails) >= 40, `${place.name} description under 40 words (${wordCount(longDetails)})`);
    assert.ok(wordCount(longDetails) <= 120, `${place.name} description over 120 words (${wordCount(longDetails)})`);
  }
  if (category === 'flight') {
    flights += 1;
    assert.ok(price != null && price !== '', `${place.name} missing flight price`);
  }
  if (category === 'car') {
    cars += 1;
    assert.ok(price != null && price !== '', `${place.name} missing car price`);
  }
}

assert.ok(hotels >= 22, `expected >= 22 hotels, got ${hotels}`);
assert.ok(flights >= 10, `expected >= 10 flights, got ${flights}`);
assert.equal(cars, 1, `expected 1 car, got ${cars}`);
assert.equal(hotelDescPass, hotels, `hotel_desc ${hotelDescPass}/${hotels}`);
assert.equal(hotelMissingUrls, 0, `hotels missing summarySourceUrls: ${hotelMissingUrls}`);

const preData = await gateBCapturePreDataCheck(trip);
assert.equal(preData.pass, true, JSON.stringify(preData.failures));

console.log(JSON.stringify({
  ok: true,
  hotels,
  hotelDescPass,
  flights,
  cars,
  productTotal: hotels + flights + cars,
}, null, 2));
