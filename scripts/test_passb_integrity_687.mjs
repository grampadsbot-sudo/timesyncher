#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import {
  getThingEvidenceDossierStore,
  useThingEvidenceDossierStore,
  saveThingEvidenceDossier,
  tripPlaceDossierKey,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import {
  postDossierXai,
  sanitizeXaiUpstreamMessage,
} from '../src/vacation/xai-dossier-http.mjs';
import { computePassBDossierMetrics } from '../src/vacation/passb-dossier-metrics.mjs';
import { searchPlaceFromStoredDossier } from '../src/vacation/shared-trip-dossier-overlay.mjs';

function page(url, textBody) {
  const body = textBody.trim();
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
    return store.rows.get(key) ? JSON.parse(JSON.stringify(store.rows.get(key))) : null;
  },
  async putDossier(key, dossier) {
    store.rows.set(key, JSON.parse(JSON.stringify(dossier)));
  },
};

const urlA = 'https://venue.example/a';
const urlB = 'https://venue.example/b';
const savedPages = [
  page(urlA, 'Venue A review text with enough words about food service and atmosphere for dossier tests.'),
  page(urlB, 'Venue B second page with enough words about menu pricing hours and neighborhood context.'),
];
const persistedDossier = {
  thing: 'Integrity Bistro',
  pages: savedPages,
  attempts: [{ kind: 'page', status: 'ok', at: '2026-01-01T00:00:00.000Z' }],
};
const dossierKey = tripPlaceDossierKey(687, 9001);
await saveThingEvidenceDossier(dossierKey, persistedDossier, { storeImpl: store });

const withFields = {
  ...persistedDossier,
  fields: { summary: { value: 'Integrity Bistro summary for merge persistence checks.' } },
};
const shrunk = mergeDossierForPersistence(withFields, {
  pages: [savedPages[0]],
  fields: {},
});
assert.equal(shrunk.pages.length, 2, 'merge must never drop saved pages');
assert.ok(shrunk.fields.summary, 'merge must keep prior fields when incoming omits them');

await saveThingEvidenceDossier(dossierKey, { pages: [savedPages[0]], attempts: [] }, { storeImpl: store });
const afterBadPut = await store.getDossier(dossierKey);
assert.equal(afterBadPut.pages.length, 2, 'store put must merge and retain all saved pages');

const place = { id: 9001, title: 'Integrity Bistro', category: 'restaurant' };
let builderCalls = 0;
const failed = await fetchXaiPlaceRatings(place, {
  dossierKey,
  storeImpl: store,
  env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
  gatherImpl: async () => { throw new Error('gather must not run'); },
  extractReviewsImpl: async () => ({ set: [], stats: { status: 'skipped' } }),
  buildImpl: async () => {
    builderCalls += 1;
    const error = new Error('dossier_builder_http_403');
    error.status = 403;
    error.step = 'builder';
    error.upstream = { provider: 'xai', status: 403, step: 'builder', model: 'test-model', message: 'forbidden' };
    throw error;
  },
  judgeImpl: async () => { throw new Error('judge must not run'); },
});
assert.equal(builderCalls, 1);
assert.equal(failed.partial, true);
assert.equal(failed.failed, true);
const stored = await store.getDossier(dossierKey);
assert.equal(stored.pages.length, 2);
assert.deepEqual(stored.pages.map((p) => p.url), [urlA, urlB]);
assert.ok(stored.attempts.length >= 2);
assert.equal(stored.attempts.at(-1).status, 'failed');
assert.equal(stored.attempts.at(-1).httpStatus, 403);

assert.equal(sanitizeXaiUpstreamMessage('Bearer sk-secret123 leaked'), '');
assert.equal(sanitizeXaiUpstreamMessage('Model access denied for this team'), 'Model access denied for this team');

let capturedUpstream = null;
await assert.rejects(
  () => postDossierXai(
    { thing: 'Test' },
    'builder',
    'test-model',
    '{}',
    {
      env: { XAI_API_KEY: 'test-key' },
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: { message: 'Team lacks chat access' } }),
      }),
    },
  ),
  (error) => {
    capturedUpstream = error.upstream;
    return error.status === 403 && /dossier_builder_http_403/.test(error.message);
  },
);
assert.equal(capturedUpstream?.provider, 'xai');
assert.equal(capturedUpstream?.status, 403);
assert.equal(capturedUpstream?.message, 'Team lacks chat access');

const barePlace = {
  id: 610,
  title: 'Carbone',
  category: 'restaurant',
  sourceRecord: { description: '' },
};
const dossierOnlyDesc = {
  thing: 'Carbone',
  pages: [page('https://carbonenewyork.com/', 'Carbone Greenwich Village Italian restaurant with rigatoni and red sauce classics.')],
  attempts: [{ kind: 'page', status: 'ok' }],
  fields: {
    summary: {
      value: 'Carbone is a Greenwich Village Italian restaurant known for red-sauce classics.',
      claims: [{ text: 'Greenwich Village', pages: ['p1'], supported: true }],
    },
    description: {
      value: 'Carbone is a Greenwich Village Italian restaurant known for red-sauce classics, tableside flair, and a lively room that draws regulars for pasta and cocktails nightly.',
      claims: [{ text: 'Carbone', pages: ['p1'], supported: true }],
    },
  },
};
const bareViolations = searchPlaceOutputViolations({
  ...barePlace,
  title: barePlace.title,
  category: barePlace.category,
});
const hydrated = searchPlaceFromStoredDossier(barePlace, dossierOnlyDesc);
const hydratedViolations = searchPlaceOutputViolations({
  ...barePlace,
  ...hydrated,
  title: hydrated.title || barePlace.title,
  category: barePlace.category,
});
assert.ok(bareViolations.includes('blank_description'), 'fixture-only place must miss dossier-backed description');
assert.ok(!hydratedViolations.includes('blank_description'), 'hydrated record must carry dossier description');
assert.equal(hydrated.description, dossierOnlyDesc.fields.description.value);
const metricsDossier = {
  ...persistedDossier,
  fields: {
    summary: {
      value: 'Integrity Bistro is a neighborhood restaurant with a focused seasonal menu.',
      claims: [{ text: 'seasonal menu', pages: ['p1'], supported: true }],
    },
    description: {
      value: 'Integrity Bistro anchors the block with seasonal cooking, a concise wine list, and a dining room that regulars describe as relaxed but attentive through lunch and dinner service every week.',
      claims: [{ text: 'seasonal cooking', pages: ['p1'], supported: true }],
    },
  },
};
const metricsStore = {
  rows: new Map([[dossierKey, JSON.parse(JSON.stringify(metricsDossier))]]),
  async getDossier(key) {
    return metricsStore.rows.get(key) ? JSON.parse(JSON.stringify(metricsStore.rows.get(key))) : null;
  },
  async putDossier(key, dossier) {
    metricsStore.rows.set(key, JSON.parse(JSON.stringify(dossier)));
  },
};
process.env.DATABASE_URL = 'postgres://unit-test';
const metrics = await computePassBDossierMetrics({
  env: { ...process.env, DATABASE_URL: 'postgres://unit-test', XAI_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'test' },
  storeImpl: metricsStore,
  tripId: 687,
});
assert.equal(metrics.ok, true);

assert.deepEqual(stored.pages, savedPages, 'failed build preserves original page contents and hashes');
const stableAttemptCount = stored.attempts.length;
await saveThingEvidenceDossier(dossierKey, stored, { storeImpl: store });
await saveThingEvidenceDossier(dossierKey, stored, { storeImpl: store });
assert.equal((await store.getDossier(dossierKey)).attempts.length, stableAttemptCount, 'repeated save is idempotent');
const changedPage = page(urlA, 'Updated version of the same URL, retained alongside original captured bytes.');
const versioned = mergeDossierForPersistence(persistedDossier, { pages: [changedPage] });
assert.deepEqual(versioned.pages.slice(0, 2), savedPages, 'same URL cannot overwrite archived bytes');
assert.equal(versioned.pages.length, 3);

let databasePayload = structuredClone(persistedDossier);
let collisions = 0;
const concurrentPage = page('https://venue.example/concurrent', 'A separately committed page that must survive the competing update.');
const fakeDb = async (strings, ...values) => {
  const query = strings.join('?');
  if (query.includes('create table')) return [];
  if (query.includes('select payload')) return [{ payload: structuredClone(databasePayload) }];
  if (query.includes('insert into')) {
    if (collisions === 0) {
      collisions += 1;
      databasePayload.pages.push(concurrentPage);
      return [];
    }
    assert.ok(query.includes('where thing_evidence_dossiers.payload ='));
    assert.deepEqual(JSON.parse(values[5]), databasePayload, 'compare-and-swap uses freshly read payload');
    databasePayload = JSON.parse(values[2]);
    return [{ dossier_key: values[0] }];
  }
  throw new Error('unexpected fake database query');
};
useVacationDatabase(fakeDb);
useThingEvidenceDossierStore(null);
try {
  const postgresStore = getThingEvidenceDossierStore({ DATABASE_URL: 'postgres://unit-test' });
  await postgresStore.putDossier('shared:restaurant:race', { pages: [changedPage], attempts: [] });
  assert.equal(collisions, 1);
  assert.equal(databasePayload.pages.length, 4, 'concurrent pages and both same-URL versions survive');
  assert.deepEqual(databasePayload.pages.slice(0, 2), savedPages);
} finally {
  useVacationDatabase(null);
  useThingEvidenceDossierStore(null);
}
assert.equal(metrics.fillTargets.length, 77);
assert.ok(metrics.fillTargets.every((target) => target.needsFill), 'empty central inventory yields actual gap targets');
console.log('test_passb_integrity_687: ok');
