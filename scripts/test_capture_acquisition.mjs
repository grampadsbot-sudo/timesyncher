#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyMergedTimeline,
  dayCaptureShotNames,
  mergeDayTimelines,
} from './ops/capture/day-traversal.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureSrc = fs.readFileSync(path.join(repo, 'scripts/ops/capture/capture.mjs'), 'utf8');

assert.match(captureSrc, /discoverTripDayChips/);
assert.match(captureSrc, /day_traversal/);
assert.match(captureSrc, /mergeDayTimelines/);

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

const regions = {
  'daybyday-1280.png': { ok: true, struct: { timeline: t1 } },
  'daybyday-1280-top.png': { ok: true, struct: { timeline: t1 } },
};
applyMergedTimeline(regions, 1280, merged);
assert.equal(regions['daybyday-1280.png'].struct.timeline.length, 4);

const jobDir = path.join(repo, '..', 'job');
const unchecked = JSON.parse(fs.readFileSync(path.join(jobDir, 'hotel-unchecked.json'), 'utf8'));
const checked = JSON.parse(fs.readFileSync(path.join(jobDir, 'hotel-checked.json'), 'utf8'));
assert.equal(unchecked.thingOverrides['place:25'].timeline, undefined);
assert.equal(checked.thingOverrides['place:25'].timeline, true);
assert.deepEqual(unchecked.assignments['place:25'], [1, 2]);

console.log('capture-acquisition regression OK');
