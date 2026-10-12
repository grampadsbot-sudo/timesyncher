import assert from 'node:assert/strict';

import {
  buildDayTimeline,
  dayChipLabel,
  estimateTravelMinutes,
  mapPlacesForTimeline,
  parseClockToMinutes,
  shiftDayIndex,
  sortedDays,
} from '../src/lib/dayTimelineModel.mjs';

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
    'place:1': { timeline: true, category: 'flight' },
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
assert.equal(dayChipLabel({ day_number: 5 }), 'Day 5');
assert.equal(sortedDays(trip).length, 2);
assert.equal(shiftDayIndex(trip, 0, 1), 1);
assert.equal(shiftDayIndex(trip, 0, -1), 0);

const day1 = trip.days[0];
const day1Rows = buildDayTimeline(trip, day1);
assert.ok(day1Rows.some((row) => row.kind === 'car-pickup'));
assert.ok(day1Rows.some((row) => row.title.includes('JetBlue')));
assert.ok(day1Rows.some((row) => row.kind === 'travel'));
const hotelRow = day1Rows.find((row) => row.place?.id === 2);
assert.equal(hotelRow?.itineraryNote, 'Drop bags early');

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

const catalogTrip = {
  days: [{ id: 1, day_number: 1, title: 'Day 1' }],
  places: [
    {
      id: 99,
      name: 'Flight option: Southwest LAS-LGA 2026-06-23 07:25-16:35',
      category_name: 'Flight',
    },
  ],
  assignments: { 1: [] },
  thingOverrides: {
    'place:99': { timeline: false, category: 'flight' },
  },
};
const catalogDay = catalogTrip.days[0];
const catalogRows = buildDayTimeline(catalogTrip, catalogDay);
assert.ok(
  catalogRows.some((row) => /Southwest LAS-LGA/i.test(row.title)),
  'catalog flight options appear on day 1 even when timeline flag is false',
);

console.log('vacation-client day timeline unit checks passed');
