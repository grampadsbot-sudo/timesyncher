import assert from 'node:assert/strict';
import {
  applySearchProgressEvent,
  countPlacesByDisplayLabel,
  emptySearchProgress,
  normalizeSearchProgress,
  placeProgressIdentity,
  searchProgressDisplayLabel,
  throttleUiCounts,
} from '../src/vacation/search-progress.mjs';

assert.equal(searchProgressDisplayLabel('restaurant'), 'Restaurants');
assert.equal(searchProgressDisplayLabel('hotel'), 'Hotels');
assert.equal(searchProgressDisplayLabel('car'), 'Cars');

assert.equal(placeProgressIdentity({ title: 'A', category: 'restaurant', source: 'osm', externalId: '1' }), 'osm:1');
const counted = countPlacesByDisplayLabel([{ category: 'restaurant', title: 'A', source: 'osm', externalId: '1' }]);
assert.equal(counted.counts.Restaurants, 1);
assert.deepEqual(normalizeSearchProgress({ stage: 'searching', counts: { Hotels: 2 } }).counts, { Hotels: 2 });

let state = emptySearchProgress('job-a');

const first = applySearchProgressEvent(state, {
  jobId: 'job-a',
  eventId: 'evt-1',
  stage: 'searching',
  places: [
    { category: 'restaurant', title: 'A', source: 'osm', externalId: '1' },
    { category: 'restaurant', title: 'B', source: 'osm', externalId: '2' },
  ],
});
assert.equal(first.changed, true);
assert.equal(first.progress.counts.Restaurants, 2);
assert.deepEqual(first.progress.typeOrder, ['Restaurants']);
state = first.progress;

const replay = applySearchProgressEvent(state, {
  jobId: 'job-a',
  eventId: 'evt-1',
  stage: 'searching',
  places: [
    { category: 'restaurant', title: 'A', source: 'osm', externalId: '1' },
    { category: 'restaurant', title: 'C', source: 'osm', externalId: '3' },
  ],
});
assert.equal(replay.changed, false, 'replayed event id must not inflate counts');
assert.equal(replay.progress.counts.Restaurants, 2);

const delayedType = applySearchProgressEvent(state, {
  jobId: 'job-a',
  eventId: 'evt-2',
  stage: 'searching',
  places: [{ category: 'hotel', title: 'H1', source: 'brave', externalId: 'h1' }],
});
assert.equal(delayedType.progress.typeOrder.length, 2);
assert.equal(delayedType.progress.counts.Hotels, 1);
state = delayedType.progress;

const noUpdate = applySearchProgressEvent(state, {
  jobId: 'job-a',
  eventId: 'evt-3',
  stage: 'searching',
  places: [],
});
assert.equal(noUpdate.progress.counts.Restaurants, 2);
assert.equal(noUpdate.progress.counts.Hotels, 1);

const jobSwitch = applySearchProgressEvent(state, {
  jobId: 'job-b',
  eventId: 'evt-b1',
  stage: 'searching',
  places: [{ category: 'store', title: 'S1', source: 'osm', externalId: 's1' }],
});
assert.equal(jobSwitch.progress.jobId, 'job-b');
assert.equal(jobSwitch.progress.counts.Stores, 1);
assert.equal(jobSwitch.progress.counts.Restaurants, undefined);

const building = applySearchProgressEvent(jobSwitch.progress, {
  jobId: 'job-b',
  eventId: 'evt-b2',
  stage: 'building',
  places: [],
});
assert.equal(building.progress.stage, 'building');

const ready = applySearchProgressEvent(building.progress, {
  jobId: 'job-b',
  eventId: 'evt-b3',
  stage: 'ready',
  websiteReady: true,
  places: [],
});
assert.equal(ready.progress.stage, 'ready');
assert.equal(ready.progress.websiteReady, true);

const failed = applySearchProgressEvent(ready.progress, {
  jobId: 'job-b',
  eventId: 'evt-b4',
  stage: 'failed',
  error: 'search unavailable',
  places: [],
});
assert.equal(failed.progress.stage, 'failed');
assert.equal(failed.progress.websiteReady, false);

const t0 = { updatedAt: new Date().toISOString(), counts: { Restaurants: 1 }, stage: 'searching' };
const throttled = throttleUiCounts(t0, { ...t0, counts: { Restaurants: 1 } }, 1000);
assert.equal(throttled, t0);

const benchStarted = Date.now();
for (let i = 0; i < 5000; i += 1) {
  applySearchProgressEvent(emptySearchProgress('job-perf'), {
    jobId: 'job-perf',
    eventId: `evt-${i}`,
    places: [{ category: 'restaurant', title: `R${i}`, source: 'osm', externalId: String(i) }],
  });
}
const countsOnMs = Date.now() - benchStarted;

const noopStarted = Date.now();
for (let i = 0; i < 5000; i += 1) {
  applySearchProgressEvent(emptySearchProgress('job-perf'), {
    jobId: 'job-perf',
    eventId: 'same',
    places: [],
  });
}
const countsOffMs = Date.now() - noopStarted;

console.log(JSON.stringify({
  test: 'search_progress_flow',
  countsOnMs,
  countsOffMs,
  overheadMs: countsOnMs - countsOffMs,
}));
console.log('test_search_progress_flow: ok');
