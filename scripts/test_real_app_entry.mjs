import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { purchaseEmail } from '../src/vacation/email.mjs';
import { intakeShareSlug, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import { lowestCarOffers, withoutCarBrand } from '../src/vacation/car-offers.mjs';

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const handler = await readFile(new URL('../src/vacation/shared-trip-handler.mjs', import.meta.url), 'utf8');
const keepsake = await readFile(new URL('../src/vacation/keepsake-list-minimums.mjs', import.meta.url), 'utf8');
const intake = await readFile(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
const snapshot = await readFile(new URL('../src/vacation/pre-collaborator-snapshot.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(vacationApp, /data-screen="itinerary"/);
assert.doesNotMatch(vacationApp, /data-screen="thing"/);
assert.doesNotMatch(vacationApp, /aria-label="Vacation path"/);
assert.doesNotMatch(vacationApp, />Onboarding<\/button>/);
assert.doesNotMatch(vacationApp, />Itinerary<\/button>/);
assert.match(sharedApp, /index-BKun7ofk\.js/);
assert.match(bundle, /Vacation Day View/);
assert.match(bundle, /timeline-rail/);
assert.match(bundle, /Open thing details/);
assert.match(bundle, /Day-by-Day/);
assert.match(api, /publishIntakeShare/);
assert.match(handler, /intakeSharedResponse/);
assert.match(handler, /timesyncherIntake|sharedTripFromIntake/);
assert.match(api, /storePreCollaboratorSnapshot/);
assert.doesNotMatch(`${handler}\n${keepsake}\n${snapshot}\n${intake}`, /padKeepsakeSharedPlaces|BIG_ISLAND_FILL_DETAILS|KEEPSAKE_LIST_FILL|LIVE_TAB_FILL|catalogForShared/);

const tripId = 'eab1cbb1-5144-4be4-b856-92f0a3769db3';
assert.equal(intakeShareSlug(tripId), 'intake-eab1cbb15144');
const shared = sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Big Island',
    destination: 'Big Island, Hawaii',
    start_date: '2026-04-03',
    end_date: '2026-04-12',
  },
  things: [
    { id: 'swim', category: 'activity', title: 'Swim', whenLabel: 'later in the week', customerWhen: 'Mon Apr 6 beach or house pool', notes: ['beach or house pool'], collaboratorNotes: [] },
    { id: 'house', category: 'hotel', title: 'Kailua-Kona house', whenLabel: 'Fri Apr 3–Sun Apr 12 2026', customerWhen: '', notes: [], collaboratorNotes: [] },
  ],
});
assert.equal(shared.timesyncherIntake, true);
assert.equal(shared.days.length, 10);
assert.equal(shared.places.length, 2);
const swim = shared.places.find((place) => place.name === 'Swim');
const monday = shared.days.find((day) => day.date === '2026-04-06');
assert.equal(shared.thingOverrides[`place:${swim.id}`].timeline, true);
assert.deepEqual(shared.thingOverrides[`place:${swim.id}`].dayIds, [monday.id]);
assert.ok((shared.assignments[String(monday.id)] || []).some((row) => row.place_id === swim.id));
assert.equal(shared.places.some((place) => /Las Vegas/i.test(place.name)), false);
assert.equal(swim.category_name, 'activity');
assert.notEqual(swim.category_name, 'Attraction');
const house = shared.places.find((place) => place.name === 'Kailua-Kona house');
assert.equal(house.category_name, 'Hotel');
assert.equal(shared.permissions.share_budget, false);
assert.deepEqual(shared.budget, []);
const priced = sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Big Island',
    destination: 'Big Island, Hawaii',
    start_date: '2026-04-03',
    end_date: '2026-04-03',
  },
  things: [{ id: 'fare', category: 'transport', title: 'Shuttle', total_price: 42 }],
});
assert.equal(priced.permissions.share_budget, true);
assert.equal(priced.budget.length, 1);
assert.equal(priced.budget[0].total_price, 42);
const unlabeled = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'blank', title: 'Open block' }],
});
assert.equal(unlabeled.places[0].category_name, '');
assert.equal(unlabeled.places[0].category_icon, '');
const sourced = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'cafe', category: 'activity', title: 'Cafe', source: { category: 'restaurant' } }],
});
assert.equal(sourced.places[0].category_name, 'Restaurant');
const located = sharedTripFromIntake({
  trip: { id: tripId, title: 'Week', destination: 'Lisbon', start_date: '2026-04-03', end_date: '2026-04-05' },
  things: [{ id: 'cafe', category: 'restaurant', title: 'Harbor Cafe', source: 'brave', lat: 38.72, lng: -9.14, address: '1 Dock' }],
});
const cafe = located.places.find((place) => place.name === 'Harbor Cafe');
assert.equal(cafe.lat, 38.72);
assert.equal(cafe.lng, -9.14);
assert.equal(cafe.address, '1 Dock');
assert.equal(cafe.source, 'brave');
const email = purchaseEmail({
  contact: { firstName: 'Verify' },
  publicSlug: 'intake-eab1cbb15144',
  env: { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' },
});
assert.match(email.launchUrl, /\/shared\/intake-eab1cbb15144\/\?purchase=1$/);
assert.match(email.htmlBody, />https:\/\/vacation-staging\.timesyncher\.com\/shared\/intake-eab1cbb15144\/\?purchase=1</);
assert.doesNotMatch(email.htmlBody, /vacation-app\.html/);
assert.match(email.htmlBody, /href="https:\/\/vacation-staging\.timesyncher\.com\/shared\/intake-eab1cbb15144\/\?purchase=1"/);

const offers = [
  { brand: 'Alamo', price: 80 },
  { brand: 'Budget', price: 41 },
  { brand: 'Hertz', price: 55 },
  { brand: 'National', price: 42 },
];
assert.deepEqual(lowestCarOffers(offers, 2).map((row) => row.brand), ['Budget', 'National']);
assert.equal(withoutCarBrand(offers, 'Budget').some((row) => row.brand === 'Budget'), false);
assert.equal(withoutCarBrand(offers, 'Budget').length <= 10, true);
const carScript = await readFile(new URL('../public/ts-car-brand-filter.js', import.meta.url), 'utf8');
assert.doesNotMatch(carScript, /Payless/);
assert.match(carScript, /Remove a brand/);
assert.match(sharedApp, /ts-car-brand-filter\.js/);
console.log('real app entry gate passed');
