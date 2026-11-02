#!/usr/bin/env node
import assert from 'node:assert/strict';

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
  assignments: { 50: [{ place_id: 20, place: { id: 20, name: 'On day flight' } }] },
  thingOverrides: {
    'place:20': { dayIds: [50], category: 'flight', price: 100, timeline: true },
    'place:21': { category: 'hotel', price: 50 },
    'place:22': { category: 'restaurant', price: 40, timeline: true },
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
  true,
  'day itinerary reservations must appear on budget even when timeline override is false',
);

console.log('budget itinerary timeline-selected places passed');
