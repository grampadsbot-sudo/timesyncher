import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildDayTimeline,
  dayChipLabel,
  dayItineraryHeading,
  flightTimelineTitle,
  formatClockMinutes,
  placeCoords,
  estimateTravelMinutes,
  mapPlacesForTimeline,
  parseClockToMinutes,
  parseDurationMinutes,
  shiftDayIndex,
  sortedDays,
} from '../src/lib/dayTimelineModel.mjs';
import {
  NEGATIVE_PROOF_SHA as PR336_NEGATIVE_PROOF_SHA,
  pr336FlightOnDay,
} from './fixtures/pr336-flight-on-day-negative-proof.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const pr336OnDaySrc = execFileSync(
  'git',
  ['show', `${PR336_NEGATIVE_PROOF_SHA}:apps/vacation-client/src/lib/dayTimelineModel.mjs`],
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 },
);
assert.match(
  pr336OnDaySrc,
  /dayIds\.length === 0[\s\S]*dayIds\.includes\(String\(day\.day_number\)\)/,
  'negative-proof fixture must match PR336 onDay logic in git',
);

const trip = {
  days: [
    { id: 10, day_number: 1, date: '2026-06-10', title: 'Day 1' },
    { id: 50, day_number: 5, date: '2026-06-14', title: 'Day 5' },
  ],
  places: [
    {
      id: 1,
      name: 'JetBlue BOS → JFK 6:30 am–10:15 am',
      category_name: 'Flight',
      lat: 40.64,
      lng: -73.78,
    },
    {
      id: 2,
      name: 'Midtown hotel',
      category_name: 'Hotel',
      lat: 40.758,
      lng: -73.9855,
    },
    {
      id: 3,
      name: 'Priceline opaque Toyota Corolla',
      category_name: 'car',
      lat: 40.6413,
      lng: -73.7781,
    },
  ],
  assignments: {
    10: [
      { place_id: 1, notes: 'Flight note', place: { id: 1, name: 'JetBlue BOS → JFK 6:30 am–10:15 am' } },
      { place_id: 2, notes: '', place: { id: 2, name: 'Midtown hotel' } },
      { place_id: 3, notes: '', place: { id: 3, name: 'Priceline opaque Toyota Corolla' } },
    ],
    50: [{ place_id: 3, notes: '', place: { id: 3, name: 'Priceline opaque Toyota Corolla' } }],
  },
  thingOverrides: {
    'place:1': { timeline: true, category: 'flight', price: 248, fareDirection: 'one-way' },
    'place:2': { timeline: true, category: 'hotel', itineraryNote: 'Drop bags early' },
    'place:3': {
      timeline: true,
      category: 'car',
      rentalCompany: 'Priceline opaque',
      dayIds: [10, 50],
      perDaySchedule: {
        10: { startTime: '11:00', duration: '45' },
        50: { startTime: '16:00', duration: '45' },
      },
    },
  },
};

assert.equal(parseClockToMinutes('11:00'), 11 * 60);
assert.equal(parseClockToMinutes('4:30 pm'), 16 * 60 + 30);
assert.equal(parseClockToMinutes('7:30 p.m.'), 19 * 60 + 30);
assert.equal(parseClockToMinutes('7-9pm'), 7 * 60);
assert.equal(parseDurationMinutes('3h 45m'), 225);
assert.equal(parseDurationMinutes('45'), 45);
assert.equal(dayChipLabel({ day_number: 5 }), 'Day 5');
assert.equal(sortedDays(trip).length, 2);
assert.equal(shiftDayIndex(trip, 0, 1), 1);
assert.equal(shiftDayIndex(trip, 0, -1), 0);

const day1 = trip.days[0];
const day1Rows = buildDayTimeline(trip, day1);
assert.ok(day1Rows.some((row) => row.kind === 'car-pickup'));
assert.ok(day1Rows.some((row) => row.kind === 'flight' && row.title.includes('JetBlue')));
assert.ok(day1Rows.some((row) => row.fare));
const hotelCheckIn = day1Rows.find((row) => row.kind === 'hotel-event' && row.place?.id === 2);
assert.ok(hotelCheckIn, 'hotel check-in row');
assert.equal(hotelCheckIn?.itineraryNote, 'Drop bags early');
assert.ok(day1Rows.some((row) => row.kind === 'hotel-sleep' && row.place?.id === 2));

const day5 = trip.days[1];
const day5Rows = buildDayTimeline(trip, day5);
assert.ok(day5Rows.some((row) => row.kind === 'car-dropoff' && /Drop-off:/i.test(row.title)));

const markers = mapPlacesForTimeline(trip, day1Rows);
assert.ok(markers.some((place) => place.id === 2));
assert.equal(
  markers.some((place) => place.id === 1 || place.id === 3),
  false,
  'flight and car markers excluded',
);

const travel = estimateTravelMinutes(
  { lat: 40.6413, lng: -73.7781 },
  { lat: 40.758, lng: -73.9855 },
);
assert.ok(travel != null && travel >= 5);

const sameDayCarTrip = {
  days: [{ id: 1, day_number: 1, title: 'Day 1' }],
  places: [
    {
      id: 9,
      name: 'Same-day rental',
      category_name: 'car',
    },
  ],
  assignments: { 1: [{ place_id: 9, place: { id: 9, name: 'Same-day rental' } }] },
  thingOverrides: {
    'place:9': {
      timeline: true,
      category: 'car',
      rentalCompany: 'Local rental',
      dayIds: [1],
      perDaySchedule: { 1: { startTime: '10:00', duration: '30' } },
    },
  },
};
const sameDayRows = buildDayTimeline(sameDayCarTrip, sameDayCarTrip.days[0]);
assert.ok(sameDayRows.some((row) => row.kind === 'car-pickup'));
assert.ok(sameDayRows.some((row) => row.kind === 'car-dropoff'));

const unassignedFlightTrip = {
  days: [
    { id: 10, day_number: 1, title: 'Arrival' },
    { id: 20, day_number: 2, title: 'Explore' },
  ],
  places: [
    {
      id: 77,
      name: 'Southwest LAS → LGA 8:05 am–4:10 pm',
      category_name: 'Flight',
      lat: 36.08,
      lng: -115.15,
    },
  ],
  assignments: {
    10: [],
    20: [],
  },
  thingOverrides: {
    'place:77': { timeline: true, category: 'flight', price: 312, fareDirection: 'one-way' },
  },
};

assert.equal(
  pr336FlightOnDay([], unassignedFlightTrip.days[0]),
  true,
  'PR336 empty dayIds matched every day',
);

for (const day of unassignedFlightTrip.days) {
  const rows = buildDayTimeline(unassignedFlightTrip, day);
  assert.equal(
    rows.some((row) => row.kind === 'flight'),
    false,
    `unassigned timeline flight must not render on day ${day.day_number}`,
  );
}

const dayIdsFlightTrip = {
  ...unassignedFlightTrip,
  thingOverrides: {
    'place:77': {
      timeline: true,
      category: 'flight',
      price: 312,
      fareDirection: 'one-way',
      dayIds: [10],
    },
  },
};
assert.ok(
  buildDayTimeline(dayIdsFlightTrip, dayIdsFlightTrip.days[0]).some((row) => row.kind === 'flight'),
);
assert.equal(
  buildDayTimeline(dayIdsFlightTrip, dayIdsFlightTrip.days[1]).some((row) => row.kind === 'flight'),
  false,
);

const dayIdNumberCollisionTrip = {
  days: [
    { id: 100, day_number: 2, title: 'Day with number 2' },
    { id: 2, day_number: 1, title: 'Day id 2' },
  ],
  places: [
    {
      id: 88,
      name: 'Delta SEA → JFK 9:00 am–5:00 pm',
      category_name: 'Flight',
      lat: 47.45,
      lng: -122.3,
    },
  ],
  assignments: { 100: [], 2: [] },
  thingOverrides: {
    'place:88': {
      timeline: true,
      category: 'flight',
      price: 401,
      fareDirection: 'one-way',
      dayIds: [2],
    },
  },
};
const collisionDayById = dayIdNumberCollisionTrip.days.find((day) => day.id === 2);
const collisionDayByNumber = dayIdNumberCollisionTrip.days.find((day) => day.day_number === 2);
assert.ok(
  buildDayTimeline(dayIdNumberCollisionTrip, collisionDayById).some((row) => row.kind === 'flight'),
  'dayIds must match day.id only',
);
assert.equal(
  buildDayTimeline(dayIdNumberCollisionTrip, collisionDayByNumber).some((row) => row.kind === 'flight'),
  false,
  'dayIds must not cross-match day_number when it differs from day.id',
);
assert.equal(
  pr336FlightOnDay([2], collisionDayByNumber),
  true,
  'PR336 onDay wrongly matched day_number 2 to dayIds [2]',
);

assert.equal(dayItineraryHeading({ day_number: 1, title: 'Arrival' }), 'Day 1 · Arrival');
assert.equal(dayItineraryHeading({ day_number: 1, title: 'Day 1 · Arrival' }), 'Day 1 · Arrival');
assert.equal(dayItineraryHeading({ day_number: 10 }), 'Day 10');

const stagingFlightTrip = {
  days: [{ id: 410, day_number: 1 }, { id: 411, day_number: 2 }],
  places: [{ id: 990, name: 'Flight option: Southwest LAS-LGA 05:05-15:45', category_name: 'Flight' }],
  thingOverrides: { 'place:990': { category: 'flight', timeline: true, dayIds: [410] } },
};
assert.equal(flightTimelineTitle(stagingFlightTrip.places[0], stagingFlightTrip), 'Southwest LAS → LGA');
const stagingRows = buildDayTimeline(stagingFlightTrip, stagingFlightTrip.days[0]);
assert.deepEqual(stagingRows.map((row) => row.title), [
  'Travel to airport', 'Southwest LAS → LGA', 'Travel from airport',
]);
const transfers = stagingRows.filter((row) => row.kind === 'travel');
assert.deepEqual(transfers.map((row) => [
  row.startLabel, formatClockMinutes(row.startMin + row.durationMin), row.durationMin,
]), [
  ['3:35 am', '5:05 am', 90],
  ['3:45 pm', '5:15 pm', 90],
], 'approved staging Day 1 Southwest transfer times');
assert.ok(transfers.every((row) => row.travelMinutes === 90));
assert.deepEqual(buildDayTimeline(stagingFlightTrip, stagingFlightTrip.days[1]), [],
  'transfers follow the same explicit flight-day membership');
const flightHotelTrip = {
  ...stagingFlightTrip,
  places: [...stagingFlightTrip.places, { id: 993, name: 'Arrival hotel', category_name: 'Hotel' }],
  thingOverrides: {
    ...stagingFlightTrip.thingOverrides,
    'place:993': { category: 'hotel', timeline: true, dayIds: [410], checkInTime: '16:00' },
  },
};
assert.equal(buildDayTimeline(flightHotelTrip, flightHotelTrip.days[0])
  .find((row) => row.kind === 'hotel-event')?.conflictWith, 'Travel from airport',
  'staging airport transfer overlap marks the hotel check-in conflict');
const noFlightTimes = {
  ...stagingFlightTrip,
  places: [{ id: 990, name: 'Southwest LAS-LGA', category_name: 'Flight' }],
};
assert.equal(buildDayTimeline(noFlightTimes, noFlightTimes.days[0]).length, 1,
  'no transfer is synthesized without both flight times');

for (const missing of [null, undefined, '', '  ', false, true, [], {}]) {
  assert.equal(placeCoords({ id: 991, lat: missing, lng: missing }, {}), null,
    `missing coordinates cannot coerce to zero: ${String(missing)}`);
  assert.deepEqual(mapPlacesForTimeline({}, [{ kind: 'thing', place: { id: 991, lat: missing, lng: missing } }]), []);
}
assert.deepEqual(placeCoords({ id: 991, lat: 0, lng: '0' }, {}), { lat: 0, lng: 0 },
  'real equator and prime meridian coordinates are valid');
assert.deepEqual(placeCoords({ id: 991, lat: null, lng: '' }, {
  thingOverrides: { 'place:991': { sourceRecord: { latitude: '41.25', longitude: '-72.5' } } },
}), { lat: 41.25, lng: -72.5 }, 'missing top-level coordinates fall through to a source');
assert.deepEqual(placeCoords({ id: 991, metadata: { sourceRecord: { lat: 41.25, lng: -72.5 } } }, {}),
  { lat: 41.25, lng: -72.5 });
for (const coords of [{ lat: Infinity, lng: 1 }, { lat: 91, lng: 1 }, { lat: 1, lng: -181 }]) {
  assert.equal(placeCoords({ id: 991, ...coords }, {}), null);
}
const sourcedMarker = { id: 992, category_name: 'Restaurant', sourceRecord: { lat: '41.25', lng: '-72.5' } };
assert.deepEqual(mapPlacesForTimeline({}, [
  { kind: 'thing', place: sourcedMarker }, { kind: 'thing', place: sourcedMarker },
  { kind: 'travel', place: sourcedMarker },
]).map((place) => [place.id, place.lat, place.lng]), [[992, 41.25, -72.5]]);

console.log('vacation-client day timeline unit checks passed');
