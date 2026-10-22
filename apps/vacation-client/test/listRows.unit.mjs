import assert from 'node:assert/strict';

import { applyLiveAppListRowFields } from '../../../src/vacation/shared-trip-live-app-fields.mjs';
import {
  emptyStateMessage,
  filterPlaces,
  flightPriceDisplay,
  flightSchedule,
  parsePrice,
  pickFlightListRowSummaryText,
  placesForCategoryTab,
  rowSummary,
  sortPlaces,
  tabCategoryKey,
} from '../src/lib/listTabModel.mjs';
import { STORED_SUMMARY_LIST_ROW_PICK_BUNDLE } from '../../../src/vacation/flight-list-row-summary.mjs';
import { patchThingDetailFields } from '../../../src/vacation/trek-thing-detail-fields-patch.mjs';

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

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

const longFlightNarrative =
  'American Airlines nonstop LAS to JFK on Day 1 afternoon arrival; lands with time to reach the UWS hotel before dinner. Fixture lists $257 one-way fare per traveler for planning math only, not a verified live quote.';
const derivedFlightSummary = pickFlightListRowSummaryText(longFlightNarrative);
assert.ok(wordCount(derivedFlightSummary) >= 6, derivedFlightSummary);
assert.ok(derivedFlightSummary.length < longFlightNarrative.length);

const jetBlueFixtureSummary =
  'Airline: JetBlue; Route: LAS-JFK; Stops: nonstop; Outbound: 2026-06-23 07:22-15:31; Return: 2026-06-30 16:50-19:36; Duration: 5h09m out / 5h46m return; Price: $252 Blue Basic / $254 Economy Cabin; Status: candidate only; not booked.';
const jetBlueListLine = pickFlightListRowSummaryText(jetBlueFixtureSummary);
assert.ok(wordCount(jetBlueListLine) >= 6, jetBlueListLine);
assert.match(jetBlueListLine, /JetBlue|LAS-JFK|nonstop/i);

const bundlePick = new Function(`return (${STORED_SUMMARY_LIST_ROW_PICK_BUNDLE})`)();
assert.equal(bundlePick(jetBlueFixtureSummary), jetBlueListLine);
const patched = patchThingDetailFields('prefix,rr=G=>{const pick=t=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const w=s.split(" ").filter(Boolean);if(w.length<=20)return s;if(/^Documented .+ option/i.test(s))return s;return""};return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""},suffix');
assert.ok(patched.includes('wc(line)>=6'), patched.slice(0, 120));

const flightRowTrip = applyLiveAppListRowFields({
  places: [{ id: 90, name: 'JetBlue LAS → JFK', category_name: 'Flight' }],
  thingOverrides: {
    'place:90': {
      category: 'flight',
      price: 248,
      fareDirection: 'one-way',
      summary: longFlightNarrative,
    },
  },
});
const hotelRowTrip = applyLiveAppListRowFields({
  places: [{ id: 91, name: 'Sample Hotel', category_name: 'Hotel' }],
  thingOverrides: {
    'place:91': {
      category: 'hotel',
      price: 400,
      summary: longFlightNarrative,
    },
  },
});
assert.equal(rowSummary(flightRowTrip.places[0], flightRowTrip), derivedFlightSummary);
assert.equal(rowSummary(hotelRowTrip.places[0], hotelRowTrip), longFlightNarrative);

const thinHotelTrip = applyLiveAppListRowFields({
  places: [{ id: 92, name: 'Hotel A', category_name: 'Hotel' }],
  thingOverrides: {
    'place:92': {
      category: 'hotel',
      price: 518,
      summary: 'Neighborhood: Upper West Side; Rating: 8.',
      longDetails:
        'Neighborhood: Upper West Side; Rating: 8.4 (4,906 Booking.com reviews); Price: $518/night; Breakfast included; free cancellation noted; strong UWS fit.',
    },
  },
});
const thinHotelLine = rowSummary(thinHotelTrip.places[0], thinHotelTrip);
assert.ok(wordCount(thinHotelLine) >= 6, thinHotelLine);
assert.notEqual(thinHotelLine.toLowerCase(), 'neighborhood: upper west side; rating: 8.');
assert.match(thinHotelLine, /breakfast|518|night/i);

const romerTrip = applyLiveAppListRowFields({
  places: [{ id: 625, name: 'Romer Hell\u2019s Kitchen', category_name: 'Hotel' }],
  thingOverrides: {
    'place:625': {
      category: 'hotel',
      price: 425,
      summary: 'Neighborhood: Hell\u2019s Kitchen; Rating: 8. 7 (4,512 Booking.',
      longDetails:
        'Neighborhood: Hell\u2019s Kitchen; Rating: 8.7 (4,512 Booking.com reviews); Price: $425/night; $2,977/week for 2 adults; Standard king room; Booking.com escalation result; Status: candidate, not booked.',
    },
  },
});
const romerLine = rowSummary(romerTrip.places[0], romerTrip);
assert.match(romerLine, /king room|425|Standard/i);

const patchedRr = patchThingDetailFields('prefix,rr=G=>ha(G).summary??"",suffix');
assert.ok(patchedRr.includes('longDetails'), patchedRr.slice(0, 160));

console.log('vacation-client list row unit checks passed');
