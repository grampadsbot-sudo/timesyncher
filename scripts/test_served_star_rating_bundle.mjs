#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { listRowDateRange, patchListRowDates } from '../src/vacation/list-row-dates.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));

assert.match(rendered, /tsRenderStarRatingHtml=v=>/);
assert.match(rendered, /tsParseStarRating=raw=>/);
assert.match(rendered, /data-ts-review-stars/);
assert.match(rendered, /data-ts-list-row-rating/);
assert.match(rendered, /data-ts-detail-rating-stars/);
assert.match(rendered, /tsPrimaryPlaceStarRating\(ha\(G\)\)/);
assert.match(rendered, /fill="#f59e0b"/);
const oeIdx = rendered.indexOf('Oe=(G,Re,zt=!1)=>');
assert.ok(oeIdx >= 0, 'Oe list row renderer missing');
const oeBody = rendered.slice(oeIdx, oeIdx + 1400);
const varsIdx = oeBody.indexOf('tsRowRating=tsPrimaryPlaceStarRating');
const srIdx = oeBody.indexOf('sr=n.jsxs');
assert.ok(varsIdx >= 0 && srIdx >= 0 && varsIdx < srIdx, 'tsRowRating must be declared before sr= in Oe()');
assert.doesNotMatch(rendered, /review-stars-inline">★★★★★<\/span>/);
assert.match(rendered, /\.ts-star-rating\{display:inline-flex/);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle');

assert.equal(patchListRowDates(rendered), rendered, 'list date patch is idempotent');
assert.match(rendered, /"data-ts-travel-list-header":"1"/);
assert.match(rendered, /"data-ts-list-date-range":"1"/);
assert.match(rendered, /"data-ts-list-price":"1"/);
const liveCss = await readFile(new URL('../public/assets/index-CbEHlMj6.css', import.meta.url), 'utf8');
assert.match(liveCss, /\[data-ts-travel-list-header\] \.ts-star-full path[^}]+fill:#F59E0B/);
const trip = { start_date: '2026-11-16' };
const range = (category, thing, extra = {}) => listRowDateRange({ category, thing, trip, ...extra });
assert.equal(range('hotel', { checkInDate: '2026-11-15', checkOutDate: '2026-11-21' }), 'Day 0 Check-in - Day 6 Check-out');
assert.equal(range('hotel', { checkInDate: '2026-11-14', checkOutDate: '2026-11-15' }), 'Day -1 Check-in - Day 0 Check-out');
assert.equal(range('car', { pickupDate: '2026-11-16', returnDate: '2026-11-20' }), 'Day 1 Pickup - Day 5 Drop-off');
assert.equal(range('car', { pickupDate: '2026-11-16', returnDate: '2026-11-16' }), 'Day 1 Pickup - Drop-off');
assert.equal(range('car', { startTime: 'Trip window Nov 15 2026 pickup', endTime: 'Trip window Nov 21 2026 return' }), 'Day 0 Pickup - Day 6 Drop-off');
const flight = { departureDate: '2026-11-16', departureTime: '07:15', arrivalTime: '15:42', departureTimezone: 'America/Los_Angeles', arrivalTimezone: 'America/New_York' };
assert.equal(range('flight', flight), 'Day 1 Depart 7:15 AM PST - Arrive 3:42 PM EST');
assert.equal(range('flight', { ...flight, departureDate: '2026-11-15', departureTime: '22:40', arrivalDate: '2026-11-16', arrivalTime: '07:00' }), 'Day 0 Depart 10:40 PM PST - Day 1 Arrive 7:00 AM EST');
assert.equal(range('flight', { ...flight, departureDate: '2026-07-01', arrivalDate: '2026-07-01' }, { trip: { start_date: '2026-07-01' } }), 'Day 1 Depart 7:15 AM PDT - Arrive 3:42 PM EDT');
assert.equal(range('flight', { ...flight, departureTime: '18:00', arrivalTime: '17:00', departureTimezone: 'EST', arrivalTimezone: 'PST' }), 'Day 1 Depart 6:00 PM EST - Arrive 5:00 PM PST', 'westbound clocks do not invent an overnight');
assert.equal(range('flight', { externalId: 'Carrier AAA-BBB 2026-11-15 22:40-07:00+1' }, { depZone: 'PT', arrZone: 'ET' }), 'Day 0 Depart 10:40 PM PST - Day 1 Arrive 7:00 AM EST');
assert.equal(range('flight', { details: 'Return leg leaving 2026-11-21 at 18:00 and landing at 20:59.' }, { depZone: 'ET', arrZone: 'PT' }), 'Day 6 Depart 6:00 PM EST - Arrive 8:59 PM PST');
assert.equal(range('flight', { ...flight, departureDate: '2026-02-30' }), '', 'invalid dates never become invented days');
assert.equal(range('hotel', {}), '');
assert.equal(range('restaurant', flight), '');

console.log('served star rating bundle tests passed');
