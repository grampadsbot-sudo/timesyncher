#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { composeListRowDescription } from '../src/vacation/list-row-description.mjs';
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
  },
});
assert.match(hotelText, /Check-in:/i);
assert.match(hotelText, /Check-out:/i);
assert.match(hotelText, /\$188/);
assert.match(hotelText, /Google 3\.9/);
assert.match(hotelText, /Yelp 3\.3/);

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

console.log('list row description substance tests passed');
