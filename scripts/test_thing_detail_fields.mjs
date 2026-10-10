#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { patchThingDetailFields } from '../src/vacation/trek-thing-detail-fields-patch.mjs';
import {
  descriptionPassesDetailJudge,
  resolvedPresentationCategory,
  thingDetailOverrideFields,
} from '../src/vacation/thing-detail-fields.mjs';
import {
  gateBThingDetailCompleteness,
  thingDetailCompletenessForPlace,
} from '../src/vacation/gate-b-thing-detail-completeness.mjs';
import { categoryFor } from '../src/vacation/intake-shared-trip-category.mjs';
import { rowNeedsDetailBackfill } from '../src/vacation/chat-intake-place-persist.mjs';

const trip = {
  id: 'detail-trip-1',
  title: 'Detail trip',
  destination: 'New York',
  start_date: '2026-06-10',
  end_date: '2026-06-14',
};

const enrichedBar = thingRecordFromTripRow({
  id: 'bar-1',
  category: 'bar',
  title: 'Sample Cocktail Bar',
  description: 'Near Grand Central with a strong martini list and small plates that regulars praise for balanced flavors and quick service.',
  source: 'brave',
  location: { lat: 40.752, lng: -73.977, address: 'Midtown, New York, NY' },
  metadata: {
    categoryName: 'bar',
    thingDetail: {
      itineraryNote: 'Cocktails at Sample Cocktail Bar — arrive early for bar seats.',
      phone: '(212) 555-0101',
      hours: 'Mon–Sat 4pm–2am',
      website: 'https://example-bar.test/',
      googleRating: '4.6',
      googleReviewCount: '820',
      yelpRating: '4.4',
      yelpReviewCount: '410',
      review1: 'The negroni is perfectly balanced and the bartenders know their classics.',
      review1Source: 'Google',
      review2: 'Happy hour oysters are a steal before the dinner rush.',
      review2Source: 'Yelp',
      review3: 'Best martini in Midtown without the tourist markup.',
      review3Source: 'Google',
      happyHour: true,
      happyHourDays: 'Mon–Fri',
      happyHourTimes: '4–7pm',
      happyHourDeals: '$8 cocktails and $1 oysters',
      happyHourDetails: 'Mon–Fri 4–7pm: $8 cocktails and $1 oysters.',
      longDetails: 'Sample Cocktail Bar earns repeat visits for its classic cocktails, knowledgeable bartenders, and reliable happy hour. Regulars mention the negroni and martini program, oyster deals before dinner service, and a lively but not chaotic Midtown room.',
    },
  },
});

const shared = finalizeServedSharedTripPayload(sharedTripFromIntake({ trip, things: [enrichedBar] }));
const place = shared.places[0];
const override = shared.thingOverrides[`place:${place.id}`];
assert.equal(resolvedPresentationCategory({ category: 'activity', title: 'Top of the Rock', description: 'Views near JFK signage' }), 'activity');
assert.equal(resolvedPresentationCategory({ category: 'attraction', title: 'Top of the Rock' }), 'attraction');
assert.equal(categoryFor({ category: 'activity', title: 'Cafe', source: { category: 'restaurant' } }).category_name, 'Restaurant');
assert.equal(rowNeedsDetailBackfill({ category: 'bar', location: { lat: 40.7, lng: -74 } }), true);
assert.equal(thingDetailCompletenessForPlace(place, override).pass, true);
assert.equal(override.category, 'bar');
assert.match(String(override.itineraryNote || ''), /Sample Cocktail Bar/i);
assert.match(String(override.happyHourDetails || ''), /oyster/i);
assert.equal(descriptionPassesDetailJudge(override.longDetails, place.name), true);

const gate = gateBThingDetailCompleteness(shared);
assert.equal(gate.pass, true, JSON.stringify(gate.failing));

const thing = placeToTripThing({
  source: 'brave',
  title: 'Harbor Cafe',
  category: 'restaurant',
  lat: 40.7,
  lng: -74.0,
  address: '123 Main St, New York, NY',
  url: 'https://example-cafe.test/',
  rating: 4.5,
  ratingCount: 120,
  sourceRecord: { source: 'brave', rating: 4.5, count: 120 },
});
assert.match(String(thing.metadata?.thingDetail?.itineraryNote || ''), /Harbor Cafe/i);
assert.equal(thing.metadata?.thingDetail?.thirdPartyRating, '4.5');

const bundle = patchThingDetailFields(readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8'));
assert.match(bundle, /Itinerary note/);
assert.match(bundle, /itineraryNote/);
assert.match(bundle, /It\(Dt\)==="bar"\)&&n\.jsxs\("label",\{style:Hn,children:\["Happy hour details"/);

console.log('thing detail field tests passed');
