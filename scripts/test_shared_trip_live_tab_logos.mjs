#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload, renderServedSharedPageLiveTabMarkup } from '../src/vacation/shared-trip-served-page.mjs';

const tripId = crypto.randomUUID();

const thingRows = [
  {
    id: crypto.randomUUID(),
    category: 'lodging',
    title: 'Hyatt Regency Maui Resort & Spa',
    description: '',
    source: 'brave',
    location: { lat: 20.91, lng: -156.69, address: 'Kaanapali' },
    metadata: {
      categoryName: 'lodging',
      customerStatedLodging: true,
      sourceRecord: { url: 'https://hyatt.com/', source: 'brave' },
      logoUrl: 'https://hyatt.com/favicon.ico',
    },
  },
  {
    id: crypto.randomUUID(),
    category: 'car',
    title: 'Hertz Car Rental - Kahului Airport',
    description: '',
    source: 'brave',
    location: { lat: 20.89, lng: -156.43, address: 'OGG' },
    metadata: {
      categoryName: 'Store',
      providerCategories: ['Store', 'Car rental'],
      sourceRecord: { url: 'https://hertz.com/', source: 'brave' },
      logoUrl: 'https://hertz.com/favicon.ico',
    },
  },
];

const records = thingRows.map((row) => thingRecordFromTripRow(row));
const shared = applyCapturedLogos(sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Maui March 2027',
    destination: 'Maui',
    start_date: '2027-03-10',
    end_date: '2027-03-17',
    metadata: { intakeShare: true, publicSlug: `intake-${tripId.replace(/-/g, '').slice(0, 12)}` },
  },
  things: records,
}));

const servedPayload = finalizeServedSharedTripPayload(shared);
assert.ok(servedPayload.liveTabLists?.hotels);
assert.ok(servedPayload.liveTabLists?.cars);

const hotelsHtml = renderServedSharedPageLiveTabMarkup(shared, 'hotels');
const carsHtml = renderServedSharedPageLiveTabMarkup(shared, 'cars');
assert.equal(hotelsHtml, servedPayload.liveTabLists.hotels);
assert.equal(carsHtml, servedPayload.liveTabLists.cars);

assert.match(hotelsHtml, /data-shared-live-tab="hotels"/);
assert.match(hotelsHtml, /img class="tiny-logo" src="https:\/\/hyatt\.com\/favicon\.ico"/);
assert.match(hotelsHtml, /data-ts-logo-chip="1"/);

assert.match(carsHtml, /data-shared-live-tab="cars"/);
assert.match(carsHtml, /img class="tiny-logo" src="https:\/\/hertz\.com\/favicon\.ico"/);
assert.match(carsHtml, /data-ts-logo-chip="1"/);

console.log('shared trip served page live tab logo tests passed');
