import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyThingPresentation,
  sharedTripFromIntake,
  windLookupPointsFromThings,
} from '../src/vacation/intake-shared-trip.mjs';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';

const tripId = 'eab1cbb1-5144-4be4-b856-92f0a3769db3';

function present(things, destination = 'KOA') {
  return applyThingPresentation(sharedTripFromIntake({
    trip: {
      id: tripId,
      title: 'Trip',
      destination,
      start_date: '2026-04-03',
      end_date: '2026-04-05',
    },
    things,
  }));
}

const empty = present([]);
assert.deepEqual(empty.places, []);
assert.equal(Object.hasOwn(empty, 'carOfferPool'), false);
assert.deepEqual(empty.needsCustomerInput, ['car', 'flight']);
assert.equal(empty.flightAsk, 'preferredAirline');
assert.equal(empty.places.some((place) => /car|flight/i.test(String(place.category_name || ''))), false);
assert.equal(JSON.stringify(empty).includes('SpeediShuttle'), false);
assert.equal(empty.places.some((place) => place.airline || place.airport), false);

const named = present([
  { id: 'swim', category: 'activity', title: 'Swim', whenLabel: 'later in the week', customerWhen: '', notes: [], collaboratorNotes: [] },
  { id: 'house', category: 'hotel', title: 'Kailua-Kona house', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] },
]);
assert.deepEqual(named.places.map((place) => place.name), ['Swim', 'Kailua-Kona house']);
for (const place of named.places) {
  assert.equal(place.lat, undefined);
  assert.equal(place.lng, undefined);
  assert.equal(Object.hasOwn(named.thingOverrides[`place:${place.id}`], 'lat'), false);
}
assert.equal(named.places.some((place) => /car|flight/i.test(String(place.category_name || ''))), false);
assert.deepEqual(named.needsCustomerInput, ['car', 'flight']);
assert.equal(named.flightAsk, 'preferredAirline');
const house = named.places.find((place) => place.name === 'Kailua-Kona house');
const swim = named.places.find((place) => place.name === 'Swim');
assert.equal(swim.category_name, 'activity');
assert.equal(swim.category_icon, '');
assert.equal(house.category_name, 'Hotel');
assert.equal(house.description, '');
assert.equal(swim.description, '');
const island = present([{ id: 'island', category: 'activity', title: 'Big Island', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] }]);
assert.equal(island.places[0].description, '');
const cafe = present([{
  id: 'cafe',
  category: 'restaurant',
  categoryName: 'Coffee Shop',
  title: 'Harbor Cafe',
  whenLabel: '',
  customerWhen: '',
  notes: [],
  collaboratorNotes: [],
}]);
assert.equal(cafe.places[0].category_name, 'Coffee Shop');
assert.equal(cafe.places[0].category_icon, '');
const blank = present([{
  id: 'blank',
  title: 'Uncategorized stop',
  whenLabel: '',
  customerWhen: '',
  notes: [],
  collaboratorNotes: [],
}]);
assert.equal(blank.places[0].category_name, '');
assert.equal(blank.places[0].category.icon, '');

const withCar = present([
  { id: 'car', category: 'car', title: 'Saved rental', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] },
]);
assert.deepEqual(withCar.needsCustomerInput, ['flight']);
assert.equal(withCar.flightAsk, 'preferredAirline');
assert.equal(withCar.places[0].category_name, 'Car');
assert.equal(withCar.places[0].name, 'Saved rental');
assert.equal(withCar.places[0].airline, undefined);
assert.equal(withCar.places[0].airport, undefined);

const withFlight = present([
  { id: 'flight', category: 'flight', title: 'Saved flight', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] },
]);
assert.deepEqual(withFlight.needsCustomerInput, ['car']);
assert.equal(Object.hasOwn(withFlight, 'flightAsk'), false);
assert.equal(withFlight.places[0].category_name, 'Flight');
assert.equal(withFlight.places[0].airline, undefined);
assert.equal(withFlight.places[0].airport, undefined);
assert.doesNotMatch(withFlight.places[0].name, /KOA|Kona|Hawaiian|United/);

const both = present([
  { id: 'car', category: 'car', title: 'Saved rental', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] },
  { id: 'flight', category: 'flight', title: 'Saved flight', whenLabel: '', customerWhen: '', notes: [], collaboratorNotes: [] },
]);
assert.equal(Object.hasOwn(both, 'needsCustomerInput'), false);
assert.equal(Object.hasOwn(both, 'flightAsk'), false);
assert.deepEqual(both.places.map((place) => place.category_name), ['Car', 'Flight']);

const cleared = applyThingPresentation({
  needsCustomerInput: ['car', 'flight'],
  flightAsk: 'preferredAirline',
  places: [
    { id: 1, name: 'Saved flight', category_name: 'Flight' },
    { id: 2, name: 'Saved rental', category_name: 'Car' },
  ],
  thingOverrides: {},
});
assert.equal(Object.hasOwn(cleared, 'needsCustomerInput'), false);
assert.equal(Object.hasOwn(cleared, 'flightAsk'), false);

const replyFacts = draftingFacts([], 'Friday April 3.', {
  things: [{ title: 'Swim', category: 'activity' }],
});
assert.deepEqual(replyFacts.needsCustomerInput, ['car', 'flight']);
assert.equal(replyFacts.flightAsk, 'preferredAirline');
const coveredFacts = draftingFacts([], 'Friday April 3.', {
  things: [
    { title: 'Saved rental', category: 'car' },
    { title: 'Saved flight', category: 'flight' },
  ],
});
assert.equal(Object.hasOwn(coveredFacts, 'needsCustomerInput'), false);
assert.equal(Object.hasOwn(coveredFacts, 'flightAsk'), false);

const located = applyThingPresentation({
  trip: { id: tripId, title: 'Trip', destination: 'KOA', start_date: '2026-04-03' },
  places: [{ id: 7, name: 'Swim', category_name: 'Attraction', lat: 21.25, lng: -157.8, address: 'Given by the source' }],
  thingOverrides: {},
});
assert.equal(located.places.length, 1);
assert.equal(located.places[0].lat, 21.25);
assert.equal(located.places[0].lng, -157.8);
assert.equal(located.thingOverrides['place:7'].lat, 21.25);
assert.equal(located.thingOverrides['place:7'].address, 'Given by the source');

assert.deepEqual(windLookupPointsFromThings([
  { title: 'Swim' },
  { title: 'Kailua-Kona house' },
]), []);
assert.deepEqual(windLookupPointsFromThings([
  { title: 'Swim', lat: 21.25, lng: -157.8 },
]), [{ name: 'Swim', lat: 21.25, lng: -157.8 }]);

const intake = await readFile(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(intake, /PLACE_COORDS|carOfferPool|formatTakeoff|SpeediShuttle|KOA arrival|Kona arrival/);
assert.doesNotMatch(intake, /category_name: 'Attraction'/);
assert.doesNotMatch(intake, /The Kailua-Kona house/);
assert.doesNotMatch(intake, /People matter more/);
const keepsake = await readFile(new URL('../src/vacation/keepsake-list-minimums.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(keepsake, /first-pass catalog/);
const replyRules = await readFile(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(replyRules, /preferredAirline|needsCustomerInput/);

console.log('no seeded transport');
