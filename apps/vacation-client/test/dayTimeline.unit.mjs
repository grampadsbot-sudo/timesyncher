import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildDayTimeline,
  dayChipLabel,
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

console.log('vacation-client day timeline unit checks passed');
