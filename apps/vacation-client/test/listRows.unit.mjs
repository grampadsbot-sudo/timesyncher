import assert from 'node:assert/strict';

import { applyLiveAppListRowFields } from '../../../src/vacation/shared-trip-live-app-fields.mjs';
import {
  emptyStateMessage,
  filterPlaces,
  eventListPriceDisplay,
  flightPriceDisplay,
  flightSchedule,
  catalogRowDisplayName,
  logoUrlForPlace,
  placesForCategoryTab,
  sortPlaces,
  tabCategoryKey,
} from '../src/lib/listTabModel.mjs';

const trip = applyLiveAppListRowFields({
  places: [
    { id: 1, name: 'Zebra Hotel', category_name: 'Hotel' },
    { id: 2, name: 'Alpha Hotel', category_name: 'Hotel' },
    { id: 3, name: 'JetBlue BOS → JFK 6:30 am–10:15 am', category_name: 'Flight' },
    { id: 4, name: 'Tagged restaurant', category_name: 'Restaurant' },
    { id: 5, name: 'Sample event', category_name: 'event' },
  ],
  thingOverrides: {
    'place:1': { price: 500, neighborhood: 'Midtown / Central Park South' },
    'place:2': { price: 200, neighborhood: 'Midtown / Central Park South' },
    'place:3': { price: 248, fareDirection: 'one-way', category: 'flight' },
    'place:4': {
      neighborhood: 'Citywide / Flexible',
      restaurantTags: ['Italian'],
    },
    'place:5': { neighborhood: 'Citywide / Flexible', category: 'activity' },
  },
});

assert.equal(tabCategoryKey(trip.places[2], trip), 'flight');
const flightOption = {
  id: 99,
  name: 'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
  category_name: 'Flight',
};
assert.equal(
  catalogRowDisplayName(flightOption, { thingOverrides: { 'place:99': { category: 'flight' } } }),
  'American LAS-JFK 2026-06-23 12:37-20:59',
);
assert.equal(tabCategoryKey(trip.places[3], trip), 'restaurant');
assert.equal(tabCategoryKey(trip.places[4], trip), 'event');

const hotels = placesForCategoryTab(trip, 'hotels');
assert.equal(hotels.length, 2);

const priceSorted = sortPlaces(hotels, trip, { key: 'price', dir: 'asc' });
assert.equal(priceSorted[0].id, 2);
assert.equal(priceSorted[1].id, 1);

const nameSorted = sortPlaces(hotels, trip, { key: 'name', dir: 'asc' });
assert.equal(nameSorted[0].name, 'Alpha Hotel');

assert.equal(flightPriceDisplay(trip.places[2], trip), '$248 one-way');
const schedule = flightSchedule(trip.places[2], trip);
assert.equal(schedule.depart, '6:30 am');
assert.equal(schedule.arrive, '10:15 am');

const filteredRestaurants = filterPlaces(
  placesForCategoryTab(trip, 'restaurants'),
  trip,
  'restaurants',
  { area: 'All areas', type: 'Italian' },
);
assert.equal(filteredRestaurants.length, 1);

const noMatch = filterPlaces(
  placesForCategoryTab(trip, 'restaurants'),
  trip,
  'restaurants',
  { area: 'All areas', type: 'French / Bistro' },
);
assert.equal(noMatch.length, 0);
assert.equal(
  emptyStateMessage('restaurants', { categoryCount: 1, filterActive: true }),
  'No restaurants match those tags.',
);
assert.equal(
  emptyStateMessage('stores', { categoryCount: 0, filterActive: false }),
  'No items in this category yet.',
);

const opaqueCarTrip = {
  places: [{ id: 609, name: 'Priceline opaque Toyota Corolla', category_name: 'car' }],
  thingOverrides: {
    'place:609': { rentalCompany: 'Priceline opaque (test fixture)', category: 'car' },
  },
};
assert.match(logoUrlForPlace(opaqueCarTrip.places[0], opaqueCarTrip), /priceline\.com\/favicon\.ico$/);

const eventTrip = {
  places: [{ id: 606, name: 'Afternoon matinee show', category_name: 'activity' }],
  thingOverrides: { 'place:606': { price: 95, category: 'activity' } },
};
assert.equal(eventListPriceDisplay(eventTrip.places[0], eventTrip), '$95');
const freeEventTrip = {
  places: [{ id: 607, name: 'Friend meetup', category_name: 'activity' }],
  thingOverrides: { 'place:607': { price: 0 } },
};
assert.equal(eventListPriceDisplay(freeEventTrip.places[0], freeEventTrip), '');

console.log('vacation-client list row unit checks passed');
