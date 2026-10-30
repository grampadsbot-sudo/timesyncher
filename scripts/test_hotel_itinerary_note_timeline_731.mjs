import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const TIMELINE_ITIN_SKIP = /^(travel|travel-to-thing|transport|hotel-wake|hotel-sleep|hotel-chec[k]out)$/i;

function timelinePrintsItineraryNote(type, hasLine = true) {
  return !TIMELINE_ITIN_SKIP.test(String(type || '')) && hasLine;
}

assert.equal(timelinePrintsItineraryNote('hotel-event', true), true, 'hotel check-in (hotel-event) prints itinerary note');
assert.equal(timelinePrintsItineraryNote('hotel-wake', true), false, 'hotel wake skips itinerary note');
assert.equal(timelinePrintsItineraryNote('hotel-sleep', true), false, 'hotel sleep skips itinerary note');
assert.equal(timelinePrintsItineraryNote('hotel-checkout', true), false, 'hotel checkout skips itinerary note');
assert.equal(timelinePrintsItineraryNote('restaurant', true), true, 'non-hotel rows keep itinerary note');
assert.equal(timelinePrintsItineraryNote('hotel-event', false), false, 'empty note stays hidden');

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);
assert.match(committed, /hotel-wake\|hotel-sleep\|hotel-chec\[k\]out\)\$\/i\.test\(String\(_i\.type/);
assert.match(committed, /hotel-wake\|hotel-sleep\|hotel-chec\[k\]out\)\$\/i\.test\(String\(Zn\.type/);
assert.match(committed, /hotel-wake\|hotel-sleep\|hotel-chec\[k\]out\)\$\/i\.test\(String\(ua\.type/);

console.log('hotel itinerary note timeline #731 checks passed');
