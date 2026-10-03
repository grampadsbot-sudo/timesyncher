#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { sharedLiveTabListMountOutcome } from '../src/vacation/shared-live-tab-list-mount.mjs';
import { applyCapturedLogos, resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload, renderServedSharedPageLiveTabMarkup } from '../src/vacation/shared-trip-served-page.mjs';

function intakeShared({ tripId, things }) {
  const records = things.map((row) => thingRecordFromTripRow(row));
  return applyCapturedLogos(sharedTripFromIntake({
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
}

const tripId = crypto.randomUUID();
const hotelId = crypto.randomUUID();
const carId = crypto.randomUUID();

const thingRows = [
  {
    id: hotelId,
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
    id: carId,
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

const shared = intakeShared({ tripId, things: thingRows });
const servedPayload = finalizeServedSharedTripPayload(shared);
assert.ok(Object.prototype.hasOwnProperty.call(servedPayload.liveTabLists, 'hotels'));
assert.ok(Object.prototype.hasOwnProperty.call(servedPayload.liveTabLists, 'cars'));

const hotelsHtml = renderServedSharedPageLiveTabMarkup(shared, 'hotels');
const carsHtml = renderServedSharedPageLiveTabMarkup(shared, 'cars');
assert.equal(
  `<ul data-shared-live-tab="hotels">${servedPayload.liveTabLists.hotels.join('')}</ul>`,
  hotelsHtml,
);
assert.equal(
  `<ul data-shared-live-tab="cars">${servedPayload.liveTabLists.cars.join('')}</ul>`,
  carsHtml,
);

assert.match(hotelsHtml, /data-shared-live-tab="hotels"/);
assert.match(hotelsHtml, /img class="tiny-logo" src="https:\/\/hyatt\.com\/favicon\.ico"/);
assert.match(hotelsHtml, /data-ts-logo-chip="1"/);

assert.match(carsHtml, /data-shared-live-tab="cars"/);
assert.match(carsHtml, /img class="tiny-logo" src="https:\/\/hertz\.com\/favicon\.ico"/);
assert.match(carsHtml, /data-ts-logo-chip="1"/);

const mountHotels = sharedLiveTabListMountOutcome('hotels', servedPayload.liveTabLists);
const mountCars = sharedLiveTabListMountOutcome('cars', servedPayload.liveTabLists);
assert.equal(mountHotels.kind, 'html');
assert.equal(mountHotels.html, hotelsHtml);
assert.equal(mountCars.kind, 'html');
assert.equal(mountCars.html, carsHtml);

const noLogoTripId = crypto.randomUUID();
const noLogoPlaceId = crypto.randomUUID();
const noLogoRecord = thingRecordFromTripRow({
  id: noLogoPlaceId,
  category: 'lodging',
  title: 'Unbranded Lodging Place',
  description: '',
  source: 'brave',
  location: { lat: 20.91, lng: -156.69, address: 'Kaanapali' },
  metadata: {
    categoryName: 'lodging',
    customerStatedLodging: true,
    sourceRecord: { source: 'brave' },
  },
});
const noLogoShared = sharedTripFromIntake({
  trip: {
    id: noLogoTripId,
    title: 'Maui March 2027',
    destination: 'Maui',
    start_date: '2027-03-10',
    end_date: '2027-03-17',
    metadata: { intakeShare: true, publicSlug: `intake-${noLogoTripId.replace(/-/g, '').slice(0, 12)}` },
  },
  things: [noLogoRecord],
});
const noLogoLogs = [];
const noLogoPayload = finalizeServedSharedTripPayload(noLogoShared, {
  onLogoMissing: (place) => {
    noLogoLogs.push({
      event: 'logo_missing',
      placeId: String(place.id || ''),
      placeName: String(place.name || place.title || ''),
      source: String(place.source || place.metadata?.sourceRecord?.source || ''),
      sourceUrl: String(place.sourceRecord?.url || place.metadata?.sourceRecord?.url || ''),
    });
  },
});
assert.equal(noLogoLogs.length, 1);
assert.equal(noLogoLogs[0].placeName, 'Unbranded Lodging Place');
assert.ok(noLogoLogs[0].placeId);
assert.equal(noLogoLogs[0].sourceUrl, '');
const defaultLogoLogs = [];
const priorError = console.error;
console.error = (line) => {
  defaultLogoLogs.push(String(line));
  priorError(line);
};
finalizeServedSharedTripPayload(noLogoShared);
console.error = priorError;
assert.equal(defaultLogoLogs.length, 1);
const defaultRow = JSON.parse(defaultLogoLogs[0]);
assert.equal(defaultRow.event, 'logo_missing');
assert.equal(defaultRow.placeName, 'Unbranded Lodging Place');

const noLogoRow = noLogoPayload.liveTabLists.hotels[0];
assert.match(noLogoRow, /data-has-logo="0"/);
assert.doesNotMatch(noLogoRow, /<img class="tiny-logo"/);

const emptyTripId = crypto.randomUUID();
const emptyShared = intakeShared({ tripId: emptyTripId, things: [] });
const emptyPayload = finalizeServedSharedTripPayload(emptyShared);
assert.deepEqual(emptyPayload.liveTabLists.hotels, []);
assert.deepEqual(emptyPayload.liveTabLists.cars, []);
assert.equal(sharedLiveTabListMountOutcome('hotels', emptyPayload.liveTabLists).kind, 'empty');
assert.equal(sharedLiveTabListMountOutcome('cars', emptyPayload.liveTabLists).kind, 'empty');

assert.throws(
  () => sharedLiveTabListMountOutcome('hotels', { cars: [] }),
  /shared_live_tab_lists_missing:hotels/,
);

assert.equal(
  resolveThingLogoUrl({ image_url: '/ts-thing-logos/car.svg', category_name: 'Car' }, { category: 'car' }),
  '/ts-thing-logos/car.svg',
);

console.log('shared trip served page live tab logo tests passed');
