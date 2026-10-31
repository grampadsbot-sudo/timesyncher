#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import handler from '../routes/thing-evidence-dossiers.mjs';
import { listTripThingsMissingDossiers, placeFromTarget, runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-rebuild.mjs';
import { stampReviewsEvidencePageHash } from '../src/vacation/dossier-reviews-rebuild.mjs';
import {
  tripPlaceDossierKey,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const store = {
  rows: new Map(),
  async getDossier(key) {
    return this.rows.get(key) || null;
  },
  async putDossier(key, dossier) {
    const { hashes, sources } = computeDossierFieldHashes(dossier);
    this.rows.set(key, {
      ...JSON.parse(JSON.stringify(dossier)),
      fieldHashes: hashes,
      fieldSources: sources,
    });
  },
};

const target = {
  rowId: 610,
  placeId: 610,
  tripId: 99,
  title: 'Carbone',
  category: 'restaurant',
  destination: 'New York, NY',
};

const dossierKey = tripPlaceDossierKey(99, 610);

const complete = {
  thing: 'Carbone',
  pages: [page('https://example.com/a', 'Carbone spicy rigatoni and warm service ' + 'word '.repeat(40))],
  attempts: [],
  fields: {
    summary: {
      value: 'Carbone is a classic Italian restaurant in Greenwich Village with red-sauce pastas and nightly service.',
      claims: [{ text: 'Italian', pages: ['p1'], supported: true }],
    },
    description: {
      value: 'Carbone is a classic Italian restaurant in Greenwich Village with red-sauce pastas, tableside flair, and a lively dining room for special occasions, where regulars book ahead for the spicy rigatoni and a warm room that stays busy from the first seating through the late tables.',
      claims: [{ text: 'Carbone', pages: ['p1'], supported: true }],
    },
    itineraryNote: {
      value: 'Book Carbone ahead for a Greenwich Village dinner.',
      claims: [{ text: 'Carbone', pages: ['p1'], supported: true }],
    },
    price: { value: 48, unit: 'per person', claims: [{ text: '48', pages: ['p1'], supported: true }] },
    hours: { value: 'Mon-Sun 5pm-11pm', claims: [{ text: '5pm', pages: ['p1'], supported: true }] },
  },
  reviews: [1, 2, 3, 4].map((i) => ({
    text: `Carbone guest review ${i} with enough words about pasta, service, and the overall dinner experience here.`,
    rating: 5,
    claims: [{ text: 'pasta', pages: ['p1'], supported: true }],
  })),
  reviewsRead: 12,
  captureCheckpoint: 'done',
};
const completeHashes = computeDossierFieldHashes(complete);
const stamped = stampReviewsEvidencePageHash({
  ...complete,
  fieldHashes: completeHashes.hashes,
  fieldSources: completeHashes.sources,
}, { title: 'Carbone', category: 'restaurant' });
complete.fieldHashes = completeHashes.hashes;
complete.fieldSources = completeHashes.sources;
complete.reviewsEvidencePageHash = stamped.reviewsEvidencePageHash;
await store.putDossier(dossierKey, complete);
useThingEvidenceDossierStore(store);
process.env.TIMESYNCHER_WORKER_TOKEN = 'test';
process.env.XAI_API_KEY = 'test';

let gatherCalls = 0;
const first = await runThingEvidenceDossierStagingTargets([target], {
  env: { XAI_API_KEY: 'test' },
  storeImpl: store,
  skipExisting: true,
  gatherImpl: async () => {
    gatherCalls += 1;
    return { thing: 'Carbone', pages: [page('https://new.example/x', 'extra page')], attempts: [] };
  },
  buildImpl: async () => ({ payload: {}, structuredText: '{}', findings: {} }),
  judgeImpl: async () => [],
  extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
});
assert.equal(first.results[0].skipped, 'existing_dossier');
assert.equal(gatherCalls, 0);

const badReviews = {
  thing: 'Carbone',
  pages: [page('https://example.com/a', 'Carbone guests praise the spicy rigatoni and warm service every night. '.repeat(8))],
  attempts: [],
  fields: complete.fields,
  reviews: [{
    text: 'This Carbone review cites missing pages and should trigger a saved-evidence rebuild with enough words to qualify.',
    rating: 5,
    claims: [{ text: 'missing', pages: ['p99'], supported: true }],
  }],
  captureCheckpoint: 'done',
};
await store.putDossier(dossierKey, badReviews);

let buildCalls = 0;
const rebuildOpts = {
  env: { XAI_API_KEY: 'test' },
  storeImpl: store,
  skipExisting: false,
  gatherImpl: async () => {
    gatherCalls += 1;
    throw new Error('gather must not run for saved complete dossier');
  },
  buildImpl: async () => {
    buildCalls += 1;
    return { payload: {}, structuredText: '{}', findings: { reviews: [] } };
  },
  judgeImpl: async () => [],
  extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
};

const rebuildRun = await runThingEvidenceDossierStagingTargets([target], rebuildOpts);
assert.ok(buildCalls >= 1, 'default fill must run fetch path and invoke dossier builder for bad saved reviews');
assert.ok(rebuildRun.results[0].pageCount >= 1);
assert.equal(gatherCalls, 0);

const stable = {
  thing: 'Carbone',
  pages: badReviews.pages,
  attempts: [],
  fields: complete.fields,
  reviews: [{
    text: 'Carbone spicy rigatoni lived up to the hype and the service felt polished through a long Friday dinner service with friends.',
    rating: 5,
    claims: [{ text: 'spicy rigatoni', pages: ['p1'], supported: true }],
  }],
  reviewsRead: 12,
  captureCheckpoint: 'done',
};
const { hashes, sources } = computeDossierFieldHashes(stable);
await store.putDossier(dossierKey, { ...stable, fieldHashes: hashes, fieldSources: sources });

buildCalls = 0;
const noopRun = await runThingEvidenceDossierStagingTargets([target], rebuildOpts);
assert.equal(noopRun.results[0].skipped, 'existing_dossier', 'second fill should no-op when hashes and reviews are fresh');
assert.equal(buildCalls, 0);

let json = null;
await handler({
  method: 'POST',
  headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify({ targets: [target], skipExisting: true }));
  },
}, {
  statusCode: 0,
  setHeader() {},
  end(payload) {
    json = JSON.parse(String(payload));
  },
});
// #747: the route no longer runs the xAI fill path; it always runs the VK Search bot seed.
assert.equal(json.xaiCalled, 0);
assert.equal(json.fillPath, 'bot-primary');
// The bot seed re-saves the dossier; restore the fresh saved state the library checks below start from.
await store.putDossier(dossierKey, { ...stable, fieldHashes: hashes, fieldSources: sources });

const libraryTarget = { ...target, sharedLibrary: true, address: '181 Thompson St, New York, NY', url: 'https://carbone.example/' };
const libraryRun = await runThingEvidenceDossierStagingTargets([libraryTarget], {
  ...rebuildOpts,
  skipExisting: true,
});
assert.match(libraryRun.results[0].dossierKey, /^shared:restaurant:/);
assert.equal(libraryRun.results[0].skipped, 'existing_dossier');
const reused = await runThingEvidenceDossierStagingTargets([{ ...libraryTarget, tripId: 'other-trip', placeId: 'other-place' }], {
  ...rebuildOpts,
  skipExisting: true,
});
assert.equal(reused.results[0].dossierKey, libraryRun.results[0].dossierKey);
assert.equal(reused.results[0].skipped, 'existing_dossier');
assert.equal(buildCalls, 0);

const emptyTarget = { tripId: 'empty-trip', placeId: 'empty-place', title: 'Rental provider', category: 'car' };
const emptyKey = tripPlaceDossierKey(emptyTarget.tripId, emptyTarget.placeId);
await store.putDossier(emptyKey, { thing: emptyTarget.title, pages: [], attempts: [{ kind: 'brave', step: 'web_search', status: 'failed' }] });
let gapCalls = 0;
const emptyOptions = {
  ...rebuildOpts,
  env: { XAI_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'test' },
  fetchImpl: async () => {
    gapCalls += 1;
    return { ok: true, json: async () => ({ web: { results: [] } }) };
  },
};
await runThingEvidenceDossierStagingTargets([emptyTarget], emptyOptions);
const afterFirstEmptyRun = gapCalls;
assert.ok(afterFirstEmptyRun > 0, 'failed initial capture resumes with gap searches');
await runThingEvidenceDossierStagingTargets([emptyTarget], emptyOptions);
assert.equal(gapCalls, afterFirstEmptyRun, 'exhausted empty captures must not restart full search or gap searches');
assert.equal(gatherCalls, 0);

const newLibrary = await runThingEvidenceDossierStagingTargets([{
  tripId: 'library-trip', placeId: 'library-place', title: 'Harbor Bookshop', category: 'store',
  address: '12 Harbor St, Boston, MA', url: 'https://bookshop.example/', sharedLibrary: true,
}], {
  ...emptyOptions,
  gatherImpl: async () => ({ thing: 'Harbor Bookshop', pages: [], attempts: [{ kind: 'brave', status: 'failed' }] }),
});
const capturedLibrary = await store.getDossier(newLibrary.results[0].dossierKey);
assert.equal(capturedLibrary.tripUseCount, 1, 'initial gather must retain the central Thing trip metadata');
assert.deepEqual(capturedLibrary.tripIds, ['library-trip']);

const budgetTarget = { ...target, tripId: 'budget-trip', placeId: 'budget-place' };
const budgetKey = tripPlaceDossierKey(budgetTarget.tripId, budgetTarget.placeId);
await store.putDossier(budgetKey, badReviews);
let reviewGapCalls = 0;
const budgetRun = await runThingEvidenceDossierStagingTargets([budgetTarget], {
  ...emptyOptions,
  fetchImpl: async () => {
    reviewGapCalls += 1;
    return { ok: true, json: async () => ({ web: { results: [] } }) };
  },
});
const afterReview = await store.getDossier(budgetKey);
const attemptsByField = {};
for (const entry of afterReview.attempts.filter((row) => row.kind === 'gap_top_up')) {
  attemptsByField[entry.field] = (attemptsByField[entry.field] || 0) + 1;
}
assert.ok(Object.values(attemptsByField).every((count) => count <= 3));
assert.equal(reviewGapCalls, Object.values(attemptsByField).reduce((sum, count) => sum + count, 0), 'saved-review rebuild must retain every gap-search attempt');
assert.ok(budgetRun.results[0].pageCount > 0);

const bookingUrl = 'https://coastal.example/booking?from=PDX&to=BOS';
const missingFlights = await listTripThingsMissingDossiers({
  env: {}, storeImpl: { getDossier: async () => null },
  dbImpl: async () => [{
    id: 'flight-needing-capture', trip_id: 'booking-trip', category: 'flight',
    title: 'Flight option: Coastal Air PDX to BOS', destination: 'Boston',
    description: 'Coastal Air flies from Portland to Boston.',
    metadata: { sourceRecord: { website: bookingUrl, summary: 'Portland to Boston with Coastal Air.' } },
  }],
});
assert.equal(missingFlights.targets.length, 1);
const missingFlight = placeFromTarget(missingFlights.targets[0]);
assert.equal(missingFlight.url, bookingUrl, 'allMissing must retain the official booking URL for the gatherer');
assert.equal(missingFlight.sourceRecord.summary, 'Portland to Boston with Coastal Air.');
assert.equal(missingFlight.description, 'Coastal Air flies from Portland to Boston.');
assert.equal(missingFlight.title, 'Coastal Air PDX to BOS');

console.log('test_thing_evidence_dossier_worker_route: ok');
