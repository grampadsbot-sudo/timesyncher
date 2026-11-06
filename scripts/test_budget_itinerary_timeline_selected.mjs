#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { placesForBudget } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import {
  budgetItineraryPlaces,
  isTimelineSelectedPlace,
} from '../src/vacation/budget-itinerary-places.mjs';

const timelineOnlyTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 50, day_number: 1 }],
  places: [
    { id: 20, name: 'On day flight', category_name: 'Flight' },
    { id: 21, name: 'List-only hotel', category_name: 'Hotel' },
    { id: 22, name: 'Saved timeline bistro', category_name: 'Restaurant' },
  ],
  assignments: { 50: [{ place_id: 20, place: { id: 20, name: 'On day flight' } }, { place_id: 22 }] },
  thingOverrides: {
    'place:20': { dayIds: [50], category: 'flight', price: 100, timeline: true },
    'place:21': { category: 'hotel', price: 50 },
    'place:22': { category: 'restaurant', price: 40, timeline: true, dayIds: [50] },
  },
};

assert.equal(isTimelineSelectedPlace(timelineOnlyTrip.places[1], timelineOnlyTrip), false);
assert.equal(isTimelineSelectedPlace(timelineOnlyTrip.places[2], timelineOnlyTrip), true);

const budgetPlaces = placesForBudget(timelineOnlyTrip);
assert.deepEqual(
  budgetPlaces.map((place) => String(place.id)).sort(),
  ['20', '22'],
  'budget must list every timeline-selected thing, not only assignment rows',
);
assert.equal(budgetItineraryPlaces(timelineOnlyTrip).length, budgetPlaces.length);

const reservationTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 501, day_number: 1, date: '2026-06-23' }],
  places: [{ id: 670, name: 'Amelie Bistro & Wine Bar', category_name: 'Restaurant' }],
  assignments: {},
  reservations: [{
    place_id: 670,
    title: 'Amelie Bistro & Wine Bar',
    day_id: 501,
    type: 'activity',
    start_time: '11:00',
  }],
  thingOverrides: {
    'place:670': { category: 'restaurant', price: 65, timeline: false },
  },
};
assert.equal(
  placesForBudget(reservationTrip).some((place) => Number(place.id) === 670),
  false,
  'unpicked reservations must not appear in budget',
);

console.log('budget itinerary timeline-selected places passed');

const optionsTrip = structuredClone(timelineOnlyTrip);
optionsTrip.places.push({ id: 23, name: 'Unpicked flight', category_name: 'Flight' });
optionsTrip.thingOverrides['place:23'] = { category: 'flight', dayIds: [50], timeline: false };
optionsTrip.thingOverrides['place:21'].dayIds = [50];
optionsTrip.reservations = [{ place_id: 23 }, { place_id: 21 }];
const timelineIds = new Set(optionsTrip.days.flatMap((day) => buildDayTimeline(optionsTrip, day)).flatMap((row) => row.place ? [String(row.place.id)] : []));
assert.deepEqual(new Set(placesForBudget(optionsTrip).map((place) => String(place.id))), timelineIds);
assert.equal(timelineIds.has('21'), false);
assert.equal(timelineIds.has('23'), false);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const budgetStart = bundle.indexOf('Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di))');
const budgetEnd = bundle.indexOf(',Is=', budgetStart);
assert.ok(budgetStart > 0 && budgetEnd > budgetStart);
const budgetExpression = bundle.slice(budgetStart, budgetEnd);
const servedBudget = new Function('Qa', 'Ci', 'Ft', 'Gt', 'Qt', 'Ds', 'ua', 'zt', 'bi', 'Ut', 'let ' + budgetExpression + ';return Mo;')(
  optionsTrip.days,
  (day) => buildDayTimeline(optionsTrip, day).flatMap((row) => row.place ? [{ type: row.kind, item: row.place }] : []),
  new Map(optionsTrip.places.map((place) => [place.id, place])),
  optionsTrip.places,
  (place) => place.id,
  (place) => Boolean(optionsTrip.thingOverrides['place:' + place.id]?.timeline),
  () => 'bucket', () => 1, () => '$1', optionsTrip.reservations,
);
assert.deepEqual(new Set(servedBudget.map((row) => String(row.item.id))), timelineIds);
