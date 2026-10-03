import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureThingLogo, sourceLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { resolveThingType } from '../src/vacation/timeline-icons.mjs';
import { sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';

assert.equal(captureThingLogo({ name: 'Sample Place' }, { title: 'Sample Place' }), '');
assert.equal(sourceLogoUrl({ source: { logo: 'https://cdn.example/mark.svg' } }), 'https://cdn.example/mark.svg');
assert.equal(sourceLogoUrl({ source: { favicon: 'https://cdn.example/favicon.ico' } }), 'https://cdn.example/favicon.ico');
assert.equal(sourceLogoUrl({ website: 'https://cafe.example/menu' }), 'https://cafe.example/favicon.ico');
assert.equal(sourceLogoUrl({ website: 'https://maps.google.com/maps?q=place' }), '');

assert.equal(resolveThingType({ name: 'Sample Hotel' }), 'other');
assert.equal(resolveThingType({ name: 'City A to City B' }), 'other');
assert.equal(resolveThingType({ name: 'Sample Rental' }), 'other');
assert.equal(resolveThingType({ name: 'Sample Hotel', category_name: 'Hotel' }), 'hotel');
assert.equal(resolveThingType({ name: 'City A to City B', category_name: 'Flight' }), 'flight');
assert.equal(resolveThingType({ name: 'Sample Rental', category_name: 'Car' }), 'car');

const tripId = 'eab1cbb1-5144-4be4-b856-92f0a3769db3';
const unlabeled = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'blank', title: 'Open block' }],
});
assert.equal(unlabeled.places[0].category_name, '');
assert.equal('budget' in unlabeled, false);
assert.equal('share_budget' in unlabeled.permissions, false);
const nullPrice = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'blank', title: 'Open block', total_price: null, price: null }],
});
assert.equal('budget' in nullPrice, false);
assert.equal('share_budget' in nullPrice.permissions, false);
const sourced = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'cafe', category: 'activity', title: 'Cafe', source: { category: 'restaurant' }, total_price: 18 }],
});
assert.equal(sourced.places[0].category_name, 'Restaurant');
assert.equal('budget' in sourced, false);

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const order = fs.readFileSync(new URL('../order-test.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(index, /placeholder="City"/);
assert.match(order, /placeholder="City"/);
assert.match(index, /name="state"[^>]*placeholder="State"/);
assert.match(order, /name="state"[^>]*placeholder="State"/);
assert.match(index, /name="zip"[^>]*placeholder="ZIP"/);
assert.match(order, /name="zip"[^>]*placeholder="ZIP"/);
const placeholderTrip = app.slice(app.indexOf('function isPlaceholderTrip'), app.indexOf('function dateParts'));
assert.match(placeholderTrip, /function isPlaceholderTrip/);
assert.doesNotMatch(placeholderTrip, /key ===/);

console.log('product cosmetic behavior tests passed');
