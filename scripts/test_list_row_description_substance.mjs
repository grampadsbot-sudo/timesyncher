#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assertTemporaryJavaScriptParses } from './assert-temporary-javascript-parses.mjs';
import { listRowDescriptionBundleSnippet } from '../src/vacation/list-row-description.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const TEMPLATE_RE = /\bDocumented\b.*\boption\b|\((hotel|restaurant|flight|car|store|event|tour|music|activity)\)\s*$|\b(Price|When):\s|\bBook ahead\b/i;
const words = (text) => text.split(/\s+/).filter(Boolean).length;

const rows = {
  carSourced: {
    category: 'car',
    summary: 'Cheapest airport option, but the supplier is hidden.',
    price: 306,
    sourceRecord: {
      vehicleClass: 'Standard sedan',
      pickupLocation: 'Airport rental car facility, Federal Circle',
      returnLocation: 'Airport rental car facility, Federal Circle',
      pickupHours: 'Counter hours are not shown before booking; the supplier stays hidden until checkout.',
      dropoffHours: 'Return timing follows the booked rental; confirm drop-off hours when you pay.',
      reputationNote: 'Review summary: no company-specific counter confidence because the supplier is unknown.',
      reviewThemes: ['Supplier hidden until checkout'],
    },
  },
  carTopLevel: {
    category: 'car',
    summary: 'Compact automatic near the train.',
    price: '$172',
    pickupLocation: 'Terminal 4 counter',
    sourceRecord: { pickupLocation: 'Old lot', reviewThemes: ['Short lines', 'Few upsells'] },
  },
  hotelSourced: {
    category: 'hotel',
    summary: 'Central base with strong transit access.',
    price: 188,
    address: '150 West 48th Street',
    sourceRecord: {
      checkInTime: '16:00',
      googleRating: '3.9',
      googleReviewCount: '1070',
      thirdPartyRating: '4.1',
      thirdPartySource: 'Booking.com',
      thirdPartyReviewCount: '293',
      reviewThemes: { praise: ['clean rooms', 'helpful staff'], complaints: ['small rooms'] },
    },
  },
  restaurant: { category: 'restaurant', summary: 'Walk-in counter for late noodles.', price: 20, address: '1 Main St' },
  carBare: { category: 'car', summary: 'Hook only.' },
  carPriceOnly: { category: 'car', price: 306 },
  hotelPriceOnly: { category: 'hotel', price: 188 },
  hotelHookAndPrice: { category: 'hotel', summary: 'Quiet rooms near the park.', price: 240 },
};
const ha = (G) => rows[G.id];
const It = (G) => rows[G.id].category;
const rr = (G) => rows[G.id].summary;
const bi = (G) => rows[G.id].price ?? '';
const snippet = listRowDescriptionBundleSnippet();
assert.ok(snippet.startsWith('tsListRowDescription=G=>{') && snippet.endsWith('},'));
const describe = new Function('ha', 'It', 'rr', 'bi', `let ${snippet.slice(0, -1)};return tsListRowDescription;`)(ha, It, rr, bi);

const car = describe({ id: 'carSourced' });
assert.match(car, /^Cheapest airport option/);
assert.match(car, /Class: Standard sedan/);
assert.match(car, /Pickup: Airport rental car facility/);
assert.match(car, /Pickup hours: Counter hours/);
assert.match(car, /Drop-off: Airport rental car facility/);
assert.match(car, /Drop-off hours: Return timing/);
assert.match(car, /\$306 total/);
assert.match(car, /Reputation: Review summary/);
assert.doesNotMatch(car, TEMPLATE_RE);
assert.ok(words(car) >= 30, `car description has ${words(car)} words`);

const carTop = describe({ id: 'carTopLevel' });
assert.match(carTop, /Pickup: Terminal 4 counter/);
assert.doesNotMatch(carTop, /Old lot/);
assert.match(carTop, /\$172 total/);
assert.match(carTop, /Reputation: Short lines; Few upsells/);
assert.doesNotMatch(carTop, TEMPLATE_RE);

const hotel = describe({ id: 'hotelSourced' });
assert.match(hotel, /Check-in: 16:00/);
assert.doesNotMatch(hotel, /Check-out:/);
assert.match(hotel, /Location: 150 West 48th Street/);
assert.match(hotel, /\$188\/night/);
assert.match(hotel, /Reputation: Google 3\.9 \(1070 reviews\); Booking\.com 4\.1 \(293 reviews\)/);
assert.doesNotMatch(hotel, /Yelp/);
assert.match(hotel, /Guests praise: clean rooms, helpful staff/);
assert.match(hotel, /Complaints: small rooms/);
assert.doesNotMatch(hotel, TEMPLATE_RE);

assert.equal(describe({ id: 'restaurant' }), 'Walk-in counter for late noodles.');
assert.equal(describe({ id: 'carBare' }), 'Hook only.');
assert.equal(describe({ id: 'carPriceOnly' }), '');
assert.equal(describe({ id: 'hotelPriceOnly' }), '');
assert.equal(describe({ id: 'hotelHookAndPrice' }), 'Quiet rooms near the park. · $240/night');

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
assert.ok(bundle.includes(`}),${snippet}Oe=(G,Re,zt=!1)=>`));
assert.equal(bundle.split('tsListRowDescription=G=>{').length - 1, 1);
assert.match(bundle, /Rn=Bs\(tsListRowDescription\(G\)\)/);
assert.doesNotMatch(bundle, /Rn=Bs\(rr\(G\)\)/);
await assertTemporaryJavaScriptParses(bundle, 'served bundle with list row description failed node --check');

console.log('list row description substance tests passed');
