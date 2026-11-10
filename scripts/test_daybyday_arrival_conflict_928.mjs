#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import {
  conflictLabelFitsViewport,
  markArrivalDayLandingConflicts,
} from '../apps/vacation-client/src/lib/dayTimelineArrivalConflicts.mjs';
import { readFileSync as readBundle } from 'node:fs';
import { patchArrivalDayTimelineConflicts } from '../src/vacation/trek-arrival-day-conflict-patch.mjs';

const nycDayOneTrip = {
  days: [{ id: 1, day_number: 1, title: 'Day 1' }],
  places: [
    { id: 601, name: 'American Airlines LAS → JFK', category_name: 'Flight' },
    { id: 602, name: "Zabar's", category_name: 'Store' },
    { id: 603, name: 'Hotel Belleclaire Central Park', category_name: 'Hotel' },
    { id: 610, name: 'Carbone', category_name: 'Restaurant' },
    { id: 611, name: 'Blue Note Jazz Club', category_name: 'Activity' },
  ],
  assignments: {
    1: [
      { place_id: 601, place: { id: 601, name: 'American Airlines LAS → JFK' } },
      { place_id: 602, place: { id: 602, name: "Zabar's" } },
      { place_id: 603, place: { id: 603, name: 'Hotel Belleclaire Central Park' } },
      { place_id: 610, place: { id: 610, name: 'Carbone' } },
      { place_id: 611, place: { id: 611, name: 'Blue Note Jazz Club' } },
    ],
  },
  thingOverrides: {
    'place:601': {
      timeline: true,
      category: 'flight',
      departureTime: '12:37 pm',
      arrivalTime: '8:59 pm',
      dayIds: [1],
    },
    'place:602': { timeline: true, category: 'store', startTime: '2:00 pm' },
    'place:603': { timeline: true, category: 'hotel', stayDays: 7, checkInTime: '4:00 pm' },
    'place:610': { timeline: true, category: 'restaurant', startTime: '7:00 pm' },
    'place:611': { timeline: true, category: 'activity', startTime: '8:30 pm', duration: '90 min' },
  },
};

const day = nycDayOneTrip.days[0];
const rows = buildDayTimeline(nycDayOneTrip, day);

function rowByPlaceId(id) {
  return rows.find((row) => row.place?.id === id);
}

const zabars = rowByPlaceId(602);
const carbone = rowByPlaceId(610);
const belleclaire = rows.find((row) => row.kind === 'hotel-event');
const blueNote = rowByPlaceId(611);
const wake = rows.find((row) => row.kind === 'hotel-wake');
const sleep = rows.find((row) => row.kind === 'hotel-sleep');

assert.ok(zabars?.conflictWith, "Zabar's 2:00 pm must conflict before landing");
assert.ok(carbone?.conflictWith, 'Carbone 7:00 pm must conflict before landing');
assert.ok(belleclaire?.conflictWith, 'Belleclaire 4:00 pm check-in must stay flagged');
assert.ok(blueNote?.conflictWith, 'Blue Note 8:30 pm must stay flagged');
assert.equal(wake?.conflictWith, undefined, 'Wake must never be flagged');
assert.equal(sleep?.conflictWith, undefined, 'Sleep must never be flagged');

const tbdRows = [
  {
    kind: 'thing',
    title: 'Mystery stop',
    startMin: null,
    startLabel: '',
    place: { id: 999, name: 'Mystery stop' },
  },
  {
    kind: 'flight',
    title: 'Inbound',
    startMin: 12 * 60 + 37,
    endLabel: '8:59 pm',
    durationMin: 5 * 60 + 22,
    place: { id: 1, name: 'Inbound', category_name: 'Flight' },
  },
  {
    kind: 'thing',
    title: 'After landing dinner',
    startMin: 21 * 60 + 15,
    startLabel: '9:15 pm',
    place: { id: 2, name: 'After landing dinner' },
  },
];
markArrivalDayLandingConflicts(tbdRows, { thingOverrides: { 'place:1': { category: 'flight' } } });
assert.equal(tbdRows[0].conflictWith, undefined, 'TBD rows without a start time must never be flagged');
assert.equal(tbdRows[2].conflictWith, undefined, 'Items after landing must not get arrival-day flags');

const css = readFileSync(new URL('../apps/vacation-client/src/styles.css', import.meta.url), 'utf8');
const conflictBlock = css.match(/\.tsv-timeline-conflict\s*\{[^}]+\}/)?.[0] || '';
assert.match(conflictBlock, /flex-wrap:\s*wrap/);
assert.doesNotMatch(conflictBlock, /white-space:\s*nowrap/);
assert.match(css, /\.tsv-timeline-conflict-text/);

assert.ok(
  conflictLabelFitsViewport({ scrollWidth: 280 }, 390),
  'conflict label scrollWidth must be within 390',
);
assert.ok(
  conflictLabelFitsViewport({ scrollWidth: 390 }, 390),
  'conflict label may use the full 390px row width',
);

const rawBundle = readBundle(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const servedBundle = patchArrivalDayTimelineConflicts(rawBundle, { served: true });
assert.ok(servedBundle.includes('tsLandFlight=js.find(wn=>wn.type==="flight"'), 'trek bundle must include arrival-day landing conflict pass');
assert.ok(servedBundle.includes('data-ts-conflict-text":"1"'), 'trek bundle conflict label must wrap at 390');

console.log('day-by-day arrival conflict #928 checks passed');
