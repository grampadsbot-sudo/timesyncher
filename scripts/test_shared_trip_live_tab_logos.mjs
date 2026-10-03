#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import {
  renderSharedLiveTabListHtml,
  sharedLiveTabRows,
} from '../src/vacation/shared-trip-live-tab-lists.mjs';

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

const hotelRows = sharedLiveTabRows(shared, 'hotels');
assert.equal(hotelRows.length, 1);
assert.equal(hotelRows[0].category, 'hotel');

const carRows = sharedLiveTabRows(shared, 'cars');
assert.equal(carRows.length, 1);
assert.equal(carRows[0].category, 'car');

const hotelsHtml = renderSharedLiveTabListHtml(shared, 'hotels');
assert.match(hotelsHtml, /data-shared-live-tab="hotels"/);
assert.match(hotelsHtml, /img class="tiny-logo" src="https:\/\/hyatt\.com\/favicon\.ico"/);

const carsHtml = renderSharedLiveTabListHtml(shared, 'cars');
assert.match(carsHtml, /data-shared-live-tab="cars"/);
assert.match(carsHtml, /img class="tiny-logo" src="https:\/\/hertz\.com\/favicon\.ico"/);

console.log('shared trip live tab logo tests passed');
