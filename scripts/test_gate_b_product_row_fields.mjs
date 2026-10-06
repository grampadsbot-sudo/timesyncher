#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { resolveThingLogoUrl, NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip } from './fixtures/nyc-pr225-shared-trip.mjs';

assert.equal(
  resolveThingLogoUrl({ name: 'Hertz', category_name: 'Car' }, { category: 'car' }),
  NAMED_THING_LOGOS.hertz,
);
assert.equal(
  resolveThingLogoUrl({ name: 'Alamo rental car', category_name: 'Car' }, { category: 'car' }),
  NAMED_THING_LOGOS.alamo,
);

const payload = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());
const car = (payload.places || []).find((place) => /priceline/i.test(place.name || ''));
assert.ok(car, 'car place');
const carOverride = payload.thingOverrides[`place:${car.id}`] || {};
assert.equal(carOverride.price, 172);
assert.match(String(carOverride.summary || ''), /JFK AirTrain/i);
assert.equal(carOverride.rentalCompany, 'Priceline opaque');

const hotel = (payload.places || []).find((place) => /midtown sample hotel/i.test(place.name || ''));
assert.ok(hotel, 'hotel place');
const hotelOverride = payload.thingOverrides[`place:${hotel.id}`] || {};
assert.match(String(hotelOverride.summary || ''), /transit access/i);
assert.equal(hotelOverride.price, 389);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /"data-list-summary":"1","data-summary-src":"thing"/);
assert.match(bundle, /children:n\.jsx\("strong",\{children:J\(G\)\|\|"Rental"\}\)/);
assert.match(bundle, /children:n\.jsx\("strong",\{children:Re\}\)/);
assert.doesNotMatch(bundle, /Open details for summary/);

console.log('gate b product row field tests passed');
