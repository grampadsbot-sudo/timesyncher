#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { stampReviewsEvidencePageHash } from '../src/vacation/dossier-reviews-rebuild.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import {
  dossierPersistedFillIsNoOp,
  fetchXaiPlaceRatings,
  judgeDossierFindings,
} from '../src/vacation/xai-grok-place-ratings.mjs';
import {
  parseRetryAfterMs,
  xaiResponsesWithRetry,
} from '../src/vacation/xai-dossier-http.mjs';

function page(url, text) {
  return { url, text, sha256: createHash('sha256').update(text).digest('hex'), fetchedAt: '2026-01-01T00:00:00.000Z' };
}

assert.equal(parseRetryAfterMs({ headers: { get: () => '2' } }), 2000);
assert.equal(parseRetryAfterMs({ headers: { get: () => null } }, 750), 750);

let retryCalls = 0;
const retried = await xaiResponsesWithRetry(async () => {
  retryCalls += 1;
  return { ok: retryCalls >= 2, status: retryCalls >= 2 ? 200 : 429, headers: { get: () => '0' } };
}, { maxAttempts: 4 });
assert.equal(retried.status, 200);
assert.equal(retryCalls, 2);

const store = {
  rows: new Map(),
  async getDossier(key) {
    return store.rows.get(key) ? JSON.parse(JSON.stringify(store.rows.get(key))) : null;
  },
  async putDossier(key, dossier) {
    store.rows.set(key, JSON.parse(JSON.stringify(dossier)));
  },
};

const dossierKey = tripPlaceDossierKey(99, 610);
const complete = {
  thing: 'Carbone',
  pages: [page('https://carbonenewyork.com/', 'Carbone spicy rigatoni and service notes '.repeat(12))],
  attempts: [{ kind: 'page', status: 'ok', startedAt: '2026-01-01T00:00:00.000Z' }],
  fields: {
    summary: {
      value: 'Carbone is a Greenwich Village Italian restaurant known for red-sauce classics and a lively room.',
      claims: [{ text: 'Greenwich Village', pages: ['p1'], supported: true }],
    },
    description: {
      value: 'Carbone is a Greenwich Village Italian restaurant known for red-sauce classics and a lively room with vintage style and tableside flair for groups, where regulars book the spicy rigatoni and stay through a long dinner service from the first seating until the late tables.',
      claims: [{ text: 'Carbone', pages: ['p1'], supported: true }],
    },
    itineraryNote: {
      value: 'Book Carbone well ahead; dinner only.',
      claims: [{ text: 'Book Carbone', pages: ['p1'], supported: true }],
    },
    price: { value: 48, unit: 'per person', claims: [{ text: '48', pages: ['p1'], supported: true }] },
    hours: { value: 'Mon-Sun 5pm-11pm', claims: [{ text: '5pm', pages: ['p1'], supported: true }] },
  },
  reviews: [1, 2, 3, 4].map((i) => ({
    text: `Carbone guest review ${i} with enough words about pasta, service, and the overall dinner experience here.`,
    rating: 5,
    claims: [{ text: 'pasta', pages: ['p1'], supported: true }],
  })),
  reviewsRead: 40,
  captureCheckpoint: 'done',
};
const place = { title: 'Carbone', category: 'restaurant' };
assert.equal(dossierPresented(normalizeDossierEvidence(complete, place), place), true);
const { hashes, sources } = computeDossierFieldHashes(complete);
const stamped = stampReviewsEvidencePageHash({ ...complete, fieldHashes: hashes, fieldSources: sources }, place);
complete.fieldHashes = hashes;
complete.fieldSources = sources;
complete.reviewsEvidencePageHash = stamped.reviewsEvidencePageHash;
await store.putDossier(dossierKey, complete);

let builderCalls = 0;
const t0 = Date.now();
const noop = await fetchXaiPlaceRatings(
  { id: 610, title: 'Carbone', category: 'restaurant' },
  {
    dossierKey,
    storeImpl: store,
    env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
    timeBudgetMs: 52000,
    buildImpl: async () => { builderCalls += 1; return { findings: {}, structuredText: '{}', payload: {} }; },
    judgeImpl: async () => { throw new Error('judge must not run'); },
    extractReviewsImpl: async () => { throw new Error('extract must not run'); },
    gatherImpl: async () => { throw new Error('gather must not run'); },
  },
);
assert.equal(noop.skipped, true);
assert.equal(builderCalls, 0);
assert.ok(Date.now() - t0 < 3000, 'no-op fill should return quickly');
assert.equal((await store.getDossier(dossierKey))?.xaiUsageRuns?.length || 0, 0);

let judgeCalls = 0;
await assert.rejects(
  () => judgeDossierFindings(
    { pages: complete.pages, thing: 'Carbone' },
    { summary: { value: 'Carbone summary text here', claims: [{ text: 'Carbone', pages: ['p1'] }] } },
    {
      env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
      deadline: Date.now() + 8000,
      fetchImpl: async () => {
        judgeCalls += 1;
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => (String(name).toLowerCase() === 'retry-after' ? '0' : null) },
        };
      },
    },
  ),
  (error) => error.resumable === true && /dossier_judge_http_429/.test(error.message),
);
assert.ok(judgeCalls >= 2, '429 judge should retry before failing');

await store.putDossier(dossierKey, {
  ...complete,
  fieldHashes: undefined,
  fieldSources: undefined,
});
const partial = await fetchXaiPlaceRatings(
  { id: 610, title: 'Carbone', category: 'restaurant' },
  {
    dossierKey,
    storeImpl: store,
    env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
    timeBudgetMs: 52000,
    gatherImpl: async () => { throw new Error('gather must not run'); },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => '0' },
    }),
  },
);
assert.equal(partial.partial, true);
assert.equal(partial.resumable, true);
assert.equal(partial.rateLimited, true);
assert.ok(partial.parsed?.evidenceDossier?.pages?.length >= 1);

console.log('test_xai_dossier_retry_682: ok');
