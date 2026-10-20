#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dayCaptureShotNames,
  mergeDayTimelines,
} from './ops/capture/day-traversal.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureSrc = fs.readFileSync(path.join(repo, 'scripts/ops/capture/capture.mjs'), 'utf8');

assert.match(captureSrc, /discoverTripDayChips/);
assert.match(captureSrc, /day_traversal/);
assert.match(captureSrc, /mergeDayTimelines/);
assert.doesNotMatch(captureSrc, /applyMergedTimeline/);

assert.deepEqual(dayCaptureShotNames(1, 1280), ['daybyday-1280-top.png', 'daybyday-1280.png']);
assert.deepEqual(dayCaptureShotNames(3, 390), ['daybyday-day3-390-top.png', 'daybyday-day3-390.png']);

const t1 = [{ title: 'Check-in: Hotel' }, { title: 'Bed: Hotel' }];
const t2 = [{ title: 'Wake: Hotel' }, { title: 'Check-out: Hotel' }];
const merged = mergeDayTimelines([{ timeline: t1 }, { timeline: t2 }]);
assert.deepEqual(merged.map((x) => x.title), [
  'Check-in: Hotel',
  'Bed: Hotel',
  'Wake: Hotel',
  'Check-out: Hotel',
]);

const sameTitleOnTwoDays = [{ timeline: [{ title: 'Bed: Hotel', day: 1 }] }, { timeline: [{ title: 'Bed: Hotel', day: 2 }] }];
const before = JSON.stringify(sameTitleOnTwoDays);
assert.deepEqual(mergeDayTimelines(sameTitleOnTwoDays).map((x) => x.day), [1, 2]);
assert.equal(JSON.stringify(sameTitleOnTwoDays), before);
assert.deepEqual(mergeDayTimelines([{ timeline: [] }, {}]), []);
console.log('capture-acquisition regression OK: shot identity, all days retained, no input mutation');
