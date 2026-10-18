import assert from 'node:assert/strict';

import { applyLiveAppListRowFields } from '../../../src/vacation/shared-trip-live-app-fields.mjs';
import {
  DEFAULT_SORT,
  carSubtitle,
  catalogRowDisplayName,
  eventListPriceDisplay,
  isDisplayNameFragment,
  numericPrice,
  opaqueCarNeedsBlank,
  rowSummary,
  emptyStateMessage,
  filterPlaces,
  flightPriceDisplay,
  flightSchedule,
  parsePrice,
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
assert.equal(tabCategoryKey(trip.places[3], trip), 'restaurant');
assert.equal(tabCategoryKey(trip.places[4], trip), 'event');
assert.equal(
  tabCategoryKey({ id: 6, name: 'AirTrain JFK link', category_name: 'transport' }, { places: [], thingOverrides: {} }),
  'event',
);

const hotels = placesForCategoryTab(trip, 'hotels');
assert.equal(hotels.length, 2);

const priceSorted = sortPlaces(hotels, trip, { key: 'price', dir: 'asc' });
assert.equal(priceSorted[0].id, 2);
assert.equal(priceSorted[1].id, 1);

const nameSorted = sortPlaces(hotels, trip, { key: 'name', dir: 'asc' });
assert.equal(nameSorted[0].name, 'Alpha Hotel');

assert.equal(parsePrice('1,200'), 1200);
assert.equal(parsePrice('$899'), 899);
assert.equal(flightPriceDisplay(trip.places[2], trip), '$248 one-way');

const hotelSortTrip = {
  places: [
    { id: 10, name: 'Hotel 10', category_name: 'Hotel' },
    { id: 9, name: 'Hotel 9', category_name: 'Hotel' },
  ],
  thingOverrides: {},
};
const hotelNameSort = sortPlaces(hotelSortTrip.places, hotelSortTrip, { key: 'name', dir: 'asc' });
assert.equal(hotelNameSort[0].name, 'Hotel 9');
assert.equal(hotelNameSort[1].name, 'Hotel 10');
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

assert.deepEqual(DEFAULT_SORT, { key: 'price', dir: 'asc' });
assert.equal(catalogRowDisplayName({ id: 99, name: 'Flight option: American LAS-JFK 12:37-20:59' }, {}),
  'American LAS-JFK 12:37-20:59');
assert.equal(tabCategoryKey({ id: 99, name: 'Flight option: American LAS-JFK' }, {}), 'flight');
const sourcedPricePlace = { id: 98, name: 'Afternoon matinee show', category_name: 'activity' };
for (const [record, expected] of [
  [{ price: 95 }, 95], [{ total_price: 75 }, 75],
  [{ sourceRecord: { ticketPrice: 45 } }, 45],
  [{ sourceRecord: { ticketsFrom: 60 } }, 60],
  [{ description: 'Tickets from $35 on the venue listing.' }, 35],
  [{ description: 'Price: about $1,250 per booking.' }, 1250],
]) {
  const place = { ...sourcedPricePlace, ...record };
  assert.equal(numericPrice(place, {}), expected);
  assert.equal(eventListPriceDisplay(place, {}), `$${expected}`);
}
assert.equal(eventListPriceDisplay(sourcedPricePlace, {}), '');
assert.equal(eventListPriceDisplay({ ...sourcedPricePlace, price: 0 }, {}), '');
assert.equal(numericPrice({ ...sourcedPricePlace, description: 'Doors at 7 pm; section 14.' }, {}), null);
const pricesToSort = [
  sourcedPricePlace,
  { ...sourcedPricePlace, id: 97, price: 90 },
  { ...sourcedPricePlace, id: 96, price: 30 },
];
assert.deepEqual(sortPlaces(pricesToSort, {}).map((place) => place.id), [96, 97, 98]);

const opaqueCar = { id: 95, name: 'Opaque rental compact', category_name: 'car' };
const sparseCarTrip = { thingOverrides: { 'place:95': {
  rentalCompany: 'Opaque rental', category: 'car', summary: 'Opaque rental compact',
} } };
assert.equal(opaqueCarNeedsBlank(opaqueCar, sparseCarTrip), true);
assert.equal(rowSummary(opaqueCar, sparseCarTrip), '');
assert.equal(carSubtitle(opaqueCar, sparseCarTrip), '');
assert.equal(isDisplayNameFragment('Opaque rental', opaqueCar.name), true);
const completeCarTrip = { thingOverrides: { 'place:95': {
  ...sparseCarTrip.thingOverrides['place:95'], totalPrice: 115,
  pickupLocation: 'North terminal desk', returnLocation: 'South terminal desk',
  pickupHours: '8 am–8 pm', dropoffHours: '8 am–8 pm', carType: 'Compact automatic',
} } };
assert.equal(opaqueCarNeedsBlank(opaqueCar, completeCarTrip), false);
assert.equal(carSubtitle(opaqueCar, completeCarTrip), 'Compact automatic');
assert.equal(opaqueCarNeedsBlank(opaqueCar, { thingOverrides: { 'place:95': {
  ...completeCarTrip.thingOverrides['place:95'], dropoffHours: 'Confirm at checkout',
} } }), true);
assert.equal(rowSummary({ id: 94, name: 'Corner cafe', description: 'Good espresso.' }, {}), '');
const fetchedTrip = { thingOverrides: { 'place:94': {
  websiteFlavour: 'The cafe roasts beans in the back room.',
  reviewThemes: { praise: ['Guests mention the fresh pastries'], complaints: ['Seats fill early'] },
} } };
assert.equal(rowSummary({ id: 94, name: 'Corner cafe' }, fetchedTrip),
  'The cafe roasts beans in the back room. Guests mention the fresh pastries. Seats fill early.');
assert.equal(rowSummary({ id: 94, name: 'Corner cafe' }, { thingOverrides: { 'place:94': {
  longDetails: 'Book ahead on weekends; arrive early for will-call or bar seating.',
} } }), '');
assert.equal(rowSummary({ id: 94, name: 'A very long descriptive name repeated as summary' }, {
  thingOverrides: { 'place:94': { longDetails: 'A very long descriptive name repeated as summary' } },
}), '', 'the full display name does not become a summary');
assert.doesNotMatch(rowSummary({ id: 94, name: 'Corner cafe' }, fetchedTrip), /Compare timing, price, neighborhood/);

console.log('vacation-client list row unit checks passed');
