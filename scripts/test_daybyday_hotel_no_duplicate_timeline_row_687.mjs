import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
const CI_ZT_DAY_ASSIGN_NEEDLE =
  'zt=(Gt||[]).map(wn=>Ft.get(wn.id)||wn).filter(wn=>jr(wn,G.id)&&Ds(wn))';
const CI_ZT_DAY_ASSIGN_PATCH =
  'zt=(Gt||[]).map(wn=>Ft.get(wn.id)||wn).filter(wn=>jr(wn,G.id)&&Ds(wn)&&!Zi(wn))';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 30 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));

assert.match(rendered, new RegExp(CI_ZT_DAY_ASSIGN_PATCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(
  rendered,
  /zt=\(Gt\|\|\[\]\)\.map\(wn=>Ft\.get\(wn\.id\)\|\|wn\)\.filter\(wn=>jr\(wn,G\.id\)&&Ds\(wn\)\)(?!&&!Zi\(wn\))/,
);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(committed, new RegExp(CI_ZT_DAY_ASSIGN_PATCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const trip = {
  days: [{ id: 10, day_number: 1, date: '2026-06-10', title: 'Day 1' }],
  places: [
    {
      id: 2,
      name: 'Hotel Beacon',
      category_name: 'Hotel',
      lat: 40.774,
      lng: -73.982,
    },
    { id: 3, name: 'Carbone', category_name: 'Restaurant', lat: 40.73, lng: -74.0 },
  ],
  assignments: {
    10: [
      { place_id: 2, place: { id: 2, name: 'Hotel Beacon' } },
      { place_id: 3, place: { id: 3, name: 'Carbone' } },
    ],
  },
  thingOverrides: {
    'place:2': { timeline: true, category: 'hotel', stayDays: 1, checkInTime: '16:00' },
    'place:3': { timeline: true, category: 'restaurant' },
  },
};

const day1 = trip.days[0];
const rows = buildDayTimeline(trip, day1);
const hotelNamedPlaceRows = rows.filter(
  (row) => row.place?.id === 2 && row.title === 'Hotel Beacon' && row.kind === 'place',
);
assert.equal(hotelNamedPlaceRows.length, 0, 'reference day model must not emit bare hotel place rows');
assert.ok(
  rows.some((row) => row.place?.id === 2 && /Check-in:/i.test(row.title)),
  'hotel check-in row must remain',
);
assert.ok(
  rows.some((row) => row.place?.id === 2 && /Sleep:|Bed:/i.test(row.title)),
  'hotel sleep row must remain',
);

console.log('day-by-day hotel duplicate timeline row guard passed');
