import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  CONFLICT_LOOP_PATCH,
  CONFLICT_LOOP_NEEDLE,
} from '../src/vacation/trek-live-product-flight-day-patches.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  flightScheduleRangeFromItem,
  applyDayTimelineConflictFlags,
  parseClockRangeFromText,
} from '../src/vacation/day-by-day-flight-conflicts.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

assert.deepEqual(parseClockRangeFromText('American LAS-JFK 2026-06-23 12:37-20:59'), {
  start: '12:37',
  end: '20:59',
});

const trip = buildNycCraigKimDaybydayTrip();
const day1 = trip.days.find((day) => Number(day.day_number) === 1);
const rows = buildDayTimeline(trip, day1);

function rowTitleIncludes(rowsList, pattern) {
  return rowsList.find(
    (row) =>
      row.kind !== 'travel' &&
      row.kind !== 'travel-to-thing' &&
      pattern.test(String(row.title || '')),
  );
}

const zabars = rowTitleIncludes(rows, /zabar/i);
const carbone = rowTitleIncludes(rows, /carbone/i);
const belleclaire = rowTitleIncludes(rows, /check-in.*belleclaire/i);
const blueNote = rowTitleIncludes(rows, /blue note/i);
const wake = rows.find((row) => row.kind === 'hotel-wake');
const sleep = rows.find((row) => row.kind === 'hotel-sleep');

assert.ok(zabars?.conflictWith, "Zabar's 2:00 pm must conflict with in-transit flight");
assert.ok(carbone?.conflictWith, 'Carbone 7:00 pm must conflict with in-transit flight');
assert.ok(belleclaire?.conflictWith, 'Belleclaire check-in must stay conflict-flagged');
assert.ok(blueNote?.conflictWith, 'Blue Note 8:30 pm must stay conflict-flagged');
assert.equal(wake?.conflictWith, undefined, 'Wake must never be conflict-flagged');
assert.equal(sleep?.conflictWith, undefined, 'Sleep must never be conflict-flagged');

const flight = rows.find((row) => row.kind === 'flight');
assert.ok(flight?.startMin != null && flight?.endMin != null, 'flight row must parse stored schedule range');

const synthetic = [
  { kind: 'flight', title: 'Sample Air', startMin: 12 * 60 + 37, endMin: 20 * 60 + 59 },
  { kind: 'thing', title: 'Early lunch', startMin: 14 * 60 },
  { kind: 'hotel-wake', title: 'Wake: Hotel', startMin: null },
];
applyDayTimelineConflictFlags(synthetic);
assert.equal(synthetic[1].conflictWith, 'Sample Air');
assert.equal(synthetic[2].conflictWith, undefined);

const ov = trip.thingOverrides['place:601'] || {};
const place = trip.places.find((p) => Number(p.id) === 601);
assert.deepEqual(flightScheduleRangeFromItem(place, ov), {
  start: '12:37',
  end: '20:59',
});

const upstream = execFileSync(
  'git',
  ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'],
  { cwd: repoRoot, maxBuffer: 30 * 1024 * 1024 },
);
const rendered = renderServedTrekBundle(upstream.toString('utf8'));
assert.ok(rendered.includes(CONFLICT_LOOP_PATCH), 'served bundle must ship in-transit conflict loop');
assert.equal(rendered.includes(CONFLICT_LOOP_NEEDLE), false);

const committed = readFileSync(`${repoRoot}/public/assets/index-BKun7ofk.js`, 'utf8');
assert.match(
  committed,
  /data-ts-conflict-label":"1"[\s\S]*flexWrap:"wrap"/,
  'conflict label chrome must wrap at narrow width',
);

console.log('issue #928 day-by-day arrival conflict checks passed');
