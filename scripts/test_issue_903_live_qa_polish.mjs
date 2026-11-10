#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { primaryPlaceStarRating } from '../src/vacation/star-rating-model.mjs';
import { applyLiveQa903Presentation, citedShowsRatingFromNarrative } from '../src/vacation/live-qa-903-presentation.mjs';
import { patchUi903DetailChrome } from '../src/vacation/trek-qa-903-ui-patch.mjs';
import fixture from './fixtures/nyc-screen-trip99-live-shared-api.json' with { type: 'json' };

const carboneCite = citedShowsRatingFromNarrative(fixture.thingOverrides['place:610'].longDetails);
assert.equal(carboneCite?.value, 4.2);
assert.equal(primaryPlaceStarRating(fixture.thingOverrides['place:610']), 4.2);

const polishedTrip = applyLiveQa903Presentation({
  ...fixture,
  trip: { start_date: '2026-06-23', end_date: '2026-06-30' },
});
const carbone = polishedTrip.thingOverrides['place:610'];
assert.equal(primaryPlaceStarRating(carbone), 4.2);

const matinee = polishedTrip.thingOverrides['place:606'];
assert.equal(primaryPlaceStarRating(matinee), null, 'composed matinee must not borrow TKTS stars');
const meetup = polishedTrip.thingOverrides['place:607'];
assert.equal(primaryPlaceStarRating(meetup), null, 'composed meetup must not borrow park stars');

const hours = polishedTrip.thingOverrides['place:607'].hours || '';
assert.doesNotMatch(hours, /\bOct:/i, 'June trip hours must not name October');

const upsell = polishedTrip.thingOverrides['place:634'];
assert.match(upsell.title, /Business Select® upgrade/i);
assert.equal(upsell.category, 'other');

const sw630 = polishedTrip.places.find((place) => String(place.id) === '630');
assert.ok(sw630);
assert.doesNotMatch(String(sw630.name), /\d{1,2}:\d{2}/);

const prepared = prepareSharedTripForLiveApp({
  ...fixture,
  trip: { start_date: '2026-06-23', end_date: '2026-06-30' },
});
assert.equal(primaryPlaceStarRating(prepared.thingOverrides['place:606']), null);

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const cssBlock = vacationApp.match(/\.fullscreen-button\s*\{[\s\S]*?\}/)?.[0] || '';
assert.match(cssBlock, /bottom:\s*8px/);
assert.doesNotMatch(cssBlock, /top:\s*8px/);

const bundleRaw = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const patched = patchUi903DetailChrome(bundleRaw);
assert.doesNotMatch(patched, /children:"Detail page"/);
assert.match(patched, /children:"Itinerary note"/);
const bannedVisible = [
  prepared.thingOverrides['place:632']?.summary,
  prepared.thingOverrides['place:609']?.rentalCompany,
].join(' ');
assert.doesNotMatch(bannedVisible, /\bkept option\b/i);
assert.doesNotMatch(bannedVisible, /\bopaque\b/i);

console.log('test_issue_903_live_qa_polish: ok');
