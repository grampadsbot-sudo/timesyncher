import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyThingPresentation,
  sharedTripFromIntake,
  windLookupPointsFromThings,
} from '../src/vacation/intake-shared-trip.mjs';

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
assert.equal(empty.places.some((place) => /car|flight/i.test(String(place.category_name || ''))), false);

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
assert.doesNotMatch(intake, /PLACE_COORDS|carOfferPool|formatTakeoff/);

console.log('no seeded transport');
