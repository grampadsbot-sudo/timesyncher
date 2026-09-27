import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { purchaseEmail } from '../src/vacation/email.mjs';
import { intakeShareSlug, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import { padKeepsakeSharedPlaces } from '../src/vacation/keepsake-list-minimums.mjs';

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const bundle = await readFile(new URL('../public/assets/index-0J54vUO3.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const handler = await readFile(new URL('../src/vacation/shared-trip-handler.mjs', import.meta.url), 'utf8');

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
assert.equal(shared.permissions.share_budget, true);
assert.equal(shared.budget.length, 1);
assert.equal(shared.budget[0].total_price, null);
const padded = padKeepsakeSharedPlaces(shared);
const count = (name) => padded.places.filter((place) => place.category_name === name).length;
assert.ok(count('Restaurant') >= 15, `restaurants ${count('Restaurant')}`);
assert.ok(count('Store') >= 10, `stores ${count('Store')}`);
assert.ok(count('Attraction') >= 15, `attractions ${count('Attraction')}`);
assert.equal(padded.places.some((place) => /Mon Ami Gabi|CATCH|Crystals|High Roller|Las Vegas/i.test(`${place.name} ${place.address}`)), false);
assert.ok(padded.places.some((place) => place.name === "Huggo's"));
assert.ok(padded.places.filter((place) => place.__tsKeepsakeFill === 1).every((place) => place.lat < 21 && place.lat > 18 && place.lng < -154));
const email = purchaseEmail({
  contact: { firstName: 'Verify' },
  publicSlug: 'intake-eab1cbb15144',
  env: { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' },
});
assert.match(email.launchUrl, /\/shared\/intake-eab1cbb15144\/$/);
assert.match(email.htmlBody, />https:\/\/vacation-staging\.timesyncher\.com\/shared\/intake-eab1cbb15144\/</);
assert.doesNotMatch(email.htmlBody, /vacation-app\.html/);
assert.match(email.htmlBody, /href="https:\/\/vacation-staging\.timesyncher\.com\/shared\/intake-eab1cbb15144\/"/);

console.log('real app entry gate passed');
