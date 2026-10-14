import assert from 'node:assert/strict';
import {
  applySearchProgressEvent,
  countPlacesByDisplayLabel,
  emptySearchProgress,
  initTripSearchProgress,
  loadTripSearchProgress,
  normalizeSearchProgress,
  placeProgressIdentity,
  recordSearchProgressPlaces,
  searchProgressDisplayLabel,
  searchProgressForClient,
  syncSearchProgressStage,
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

function mockTripProgressDb() {
  const tripId = '716d3a1f-60be-4bca-8993-dbe8bcb3196a';
  let metadata = {};
  const db = async (strings, ...values) => {
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/select metadata/i.test(text) && /from trips/i.test(text)) {
      return [{ metadata: structuredClone(metadata) }];
    }
    if (/update trips/i.test(text) && /searchProgress/i.test(text)) {
      const jsonPayload = values.find((v) => typeof v === 'string' && v.startsWith('{') && v.includes('"stage"'));
      assert.ok(jsonPayload, 'persistTripSearchProgress must write searchProgress json');
      metadata = { ...metadata, searchProgress: JSON.parse(jsonPayload) };
      return [];
    }
    throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
  };
  return { db, tripId, metadata: () => metadata };
}

const { db: progressDb, tripId: progressTripId } = mockTripProgressDb();
await initTripSearchProgress(progressDb, progressTripId, 'live-job-1');
await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-1',
  eventId: 'search:snapshot:1',
  stage: 'searching',
  places: [
    { category: 'restaurant', title: 'R1', source: 'osm', externalId: 'r1' },
    { category: 'restaurant', title: 'R2', source: 'osm', externalId: 'r2' },
  ],
});
let loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.counts.Restaurants, 2);
assert.equal(loaded.stage, 'searching');

await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-1',
  eventId: 'search:snapshot:1',
  stage: 'searching',
  places: [{ category: 'restaurant', title: 'R3', source: 'osm', externalId: 'r3' }],
});
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.counts.Restaurants, 2, 'duplicate event id must not inflate persisted counts');

await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-1',
  eventId: 'search:snapshot:2',
  stage: 'searching',
  places: [{ category: 'hotel', title: 'H1', source: 'brave', externalId: 'h1' }],
});
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.counts.Hotels, 1);

await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-2',
  eventId: 'search:snapshot:new-job',
  stage: 'searching',
  places: [{ category: 'car', title: 'C1', source: 'osm', externalId: 'c1' }],
});
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.jobId, 'live-job-2');
assert.equal(loaded.counts.Cars, 1);
assert.equal(loaded.counts.Restaurants, undefined, 'new job id resets prior type counts');

await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-2',
  eventId: 'search:failed',
  stage: 'failed',
  error: 'provider timeout',
  places: [],
});
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.stage, 'failed');
assert.equal(searchProgressForClient(loaded).websiteReady, false);

await recordSearchProgressPlaces(progressDb, progressTripId, {
  jobId: 'live-job-3',
  eventId: 'search:snapshot:3a',
  stage: 'searching',
  places: [{ category: 'store', title: 'S1', source: 'osm', externalId: 's1' }],
});
await syncSearchProgressStage(progressDb, progressTripId, { publicUrl: '' });
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.stage, 'building');
assert.match(searchProgressForClient(loaded).buildingLabel || '', /Building itinerary/);

await syncSearchProgressStage(progressDb, progressTripId, {
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/example/',
});
loaded = await loadTripSearchProgress(progressDb, progressTripId);
assert.equal(loaded.stage, 'ready');
assert.equal(loaded.websiteReady, true);
const clientPayload = searchProgressForClient(loaded);
assert.equal(clientPayload.stage, 'ready');
assert.equal(clientPayload.websiteReady, true);
assert.deepEqual(Object.keys(clientPayload), [
  'jobId', 'seq', 'stage', 'counts', 'typeOrder', 'updatedAt', 'error', 'websiteReady', 'buildingLabel',
]);

const persistBenchStarted = Date.now();
for (let i = 0; i < 200; i += 1) {
  await recordSearchProgressPlaces(progressDb, progressTripId, {
    jobId: 'live-job-bench',
    eventId: `search:snapshot:bench-${i}`,
    stage: 'searching',
    places: [{ category: 'restaurant', title: `R${i}`, source: 'osm', externalId: String(i) }],
  });
}
const persistCountsOnMs = Date.now() - persistBenchStarted;

const persistNoopStarted = Date.now();
for (let i = 0; i < 200; i += 1) {
  await recordSearchProgressPlaces(progressDb, progressTripId, {
    jobId: 'live-job-bench',
    eventId: 'search:snapshot:bench-dup',
    stage: 'searching',
    places: [{ category: 'restaurant', title: 'dup', source: 'osm', externalId: 'dup' }],
  });
}
const persistCountsOffMs = Date.now() - persistNoopStarted;

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
  persistCountsOnMs,
  persistCountsOffMs,
  persistOverheadMs: persistCountsOnMs - persistCountsOffMs,
}));
console.log('search_progress_flow_check: ok');
