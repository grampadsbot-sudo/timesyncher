#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { composeListRowDescription } from '../src/vacation/list-row-description.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const carText = composeListRowDescription({
  category: 'car',
  summary: 'Cheapest JFK option, but the supplier is hidden.',
  fields: {
    carType: 'Standard sedan',
    pickupLocation: 'JFK Airport rental car facility / Federal Circle, Jamaica, NY',
    returnLocation: 'JFK Airport rental car facility / Federal Circle, Jamaica, NY',
    pickupHours: 'Counter hours are not shown before booking; Priceline hides the supplier until checkout.',
    dropoffHours: 'Return timing follows your booked rental; confirm Jun 30 2026 drop-off hours when you pay.',
    price: 306,
    reputationNote: 'Review summary: no company-specific JFK confidence because the counter is unknown.',
  },
});
assert.match(carText, /Class:/i);
assert.match(carText, /Pickup:/i);
assert.match(carText, /Drop-off:/i);
assert.match(carText, /Pickup hours:/i);
assert.match(carText, /Drop-off hours:/i);
assert.match(carText, /\$306/);
assert.match(carText, /Reputation:/i);

const hotelText = composeListRowDescription({
  category: 'hotel',
  summary: 'Times Square base with eco-certified rooms and strong transit access.',
  fields: {
    checkInTime: '16:00',
    checkOutTime: '11:00',
    address: '150 A West 48th Street, New York, NY 10036',
    price: 188,
    googleRating: '3.9',
    googleReviewCount: '1070',
    yelpRating: '3.3',
    yelpReviewCount: '66',
    websiteFlavour: 'Compact rooms, fitness center and free Wi-Fi near Rockefeller Center.',
    reviewThemes: { praise: ['helpful staff'], complaints: ['small rooms'] },
  },
});
assert.match(hotelText, /Check-in:/i);
assert.match(hotelText, /Check-out:/i);
assert.match(hotelText, /\$188/);
assert.match(hotelText, /Google 3\.9/);
assert.match(hotelText, /Yelp 3\.3/);
assert.match(hotelText, /fitness center and free Wi-Fi/);
assert.match(hotelText, /Common praise: helpful staff/);
assert.match(hotelText, /Common complaints: small rooms/);

const listOnlyHotel = composeListRowDescription({
  category: 'hotel',
  summary: 'List-only row until ccab names a real Midtown property.',
  fields: { address: 'New York, NY', price: '$' },
});
assert.doesNotMatch(listOnlyHotel, /\bPrice:\s*(?:\/night\b)?\s*(?:·|$)/);

const payload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const carOverride = payload.thingOverrides['place:609'] || {};
const hotelOverride = payload.thingOverrides['place:603'] || {};
assert.ok(carOverride.pickupLocation);
assert.ok(hotelOverride.checkInTime);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const bundle = renderServedTrekBundle(raw);
assert.match(bundle, /tsListRowDescription=function\(G\)/);
assert.match(bundle, /Rn=Bs\(tsListRowDescription\(G\)\)/);
assert.doesNotMatch(bundle, /Rn=Bs\(rr\(G\)\)/);

function renderedDescription(js, shared, id) {
  const start = js.indexOf('tsListRowDescription=function(G){');
  const end = js.indexOf(',Oe=', start);
  assert.ok(start >= 0 && end > start);
  const override = (place) => shared.thingOverrides[`place:${place.id}`] || {};
  const describe = new Function('ha', 'It', 'bi', `let ${js.slice(start, end)};return tsListRowDescription;`)(
    override,
    (place) => productThingCategory(place, override(place)),
    (place) => override(place).price ?? place.price ?? '',
  );
  const place = shared.places.find((row) => row.id === id);
  const description = describe(place);
  assert.notEqual(description, place.name);
  assert.notEqual(description, override(place).summary);
  return description;
}

for (const js of [bundle, readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8')]) {
  const car = renderedDescription(js, payload, 609);
  for (const fact of ['Standard sedan', carOverride.pickupLocation, carOverride.returnLocation, carOverride.pickupHours, carOverride.dropoffHours, '$306', carOverride.reputationNote]) {
    assert.ok(car.includes(fact), `car description missing ${fact}`);
  }
  const hotel = renderedDescription(js, payload, 603);
  for (const fact of [hotelOverride.address, '$188/night', 'Google 3.9', 'fitness center', 'free Wi-Fi', 'friendly and helpful staff', 'small/compact rooms']) {
    assert.ok(hotel.includes(fact), `hotel description missing ${fact}`);
  }
  const blockedHotel = renderedDescription(js, payload, 608);
  assert.doesNotMatch(blockedHotel, /Price:|\$|Google|Yelp|Booking\.com/);
}

const sourceOnly = applyLiveAppListRowFields({
  places: [{ id: 7, name: 'Airport rental', category_name: 'Car', metadata: { sourceRecord: {
    vehicleClass: 'Compact', pickupLocation: 'Airport terminal', returnLocation: 'Downtown counter',
    pickupTime: '09:00', returnTime: '18:00', price: 145,
  } } }],
});
assert.equal(sourceOnly.thingOverrides['place:7'].carType, 'Compact');
assert.equal(sourceOnly.thingOverrides['place:7'].pickupLocation, 'Airport terminal');
const sourceText = renderedDescription(bundle, sourceOnly, 7);
assert.match(sourceText, /Compact/);
assert.match(sourceText, /09:00/);
assert.match(sourceText, /18:00/);
assert.match(sourceText, /\$145/);

console.log('list row description substance tests passed');
