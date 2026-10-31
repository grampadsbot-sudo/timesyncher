#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import handler from '../routes/thing-evidence-dossiers.mjs';
import {
  authorizeThingEvidenceDossierRequest,
  dossierOperatorTokenFrom,
  requireWorkerAuth,
} from '../src/vacation/auth.mjs';
import {
  buildPassBSharedDossierTargets,
  passBInventoryCounts,
  sliceDossierBatch,
} from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import {
  computePassBDossierMetrics,
  operatorPassBTimeBudgetMs,
  parsePassBOperatorOffset,
  resolvePassBOperatorTargets,
} from '../src/vacation/passb-dossier-metrics.mjs';
import { __setDossierFillTestImpls } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import {
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-rebuild.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const shared = buildPassBSharedDossierTargets();
const inventory = passBInventoryCounts(shared);
assert.equal(inventory.total, 77);
assert.deepEqual(inventory.byType, { hotel: 22, restaurant: 25, store: 15, attraction: 15 });

const { slice: batchOne, batch: metaOne } = sliceDossierBatch(shared, { offset: 0, limit: 5 });
assert.equal(batchOne.length, 5);
assert.equal(metaOne.total, 77);
assert.equal(metaOne.nextOffset, 5);
const { slice: batchTwo } = sliceDossierBatch(shared, { offset: 5, limit: 5 });
assert.equal(batchTwo[0].placeId, shared[5].placeId);

process.env.TIMESYNCHER_DOSSIER_OPERATOR_TOKEN = 'operator-secret';
process.env.TIMESYNCHER_WORKER_TOKEN = 'worker-secret';
process.env.XAI_API_KEY = 'test';
process.env.XAI_PLACE_SEARCH_MODEL = 'test-model';
process.env.BRAVE_SEARCH_API_KEY = 'test';
process.env.DATABASE_URL = 'postgres://unit-test-central-store';
delete process.env.TIMESYNCHER_DOSSIER_TEST_IMPLS;

assert.equal(authorizeThingEvidenceDossierRequest({
  headers: { authorization: 'Bearer operator-secret' },
}), 'operator');
assert.equal(authorizeThingEvidenceDossierRequest({
  headers: { authorization: 'Bearer worker-secret' },
}), 'worker');
assert.throws(
  () => authorizeThingEvidenceDossierRequest({ headers: { authorization: 'Bearer wrong' } }),
  (error) => error.statusCode === 401,
);
assert.equal(dossierOperatorTokenFrom({ headers: { 'x-timesyncher-dossier-operator-token': 'operator-secret' } }), 'operator-secret');

assert.throws(
  () => requireWorkerAuth({ headers: { authorization: 'Bearer operator-secret' } }, process.env),
  (error) => error.statusCode === 401,
);
assert.throws(
  () => requireWorkerAuth({ headers: {} }, process.env),
  (error) => error.statusCode === 401,
);
assert.doesNotThrow(
  () => requireWorkerAuth({ headers: { authorization: 'Bearer worker-secret' } }, process.env),
);

const routeSource = readFileSync(new URL('../routes/thing-evidence-dossiers.mjs', import.meta.url), 'utf8');
// #747: route must not reach the xAI fill path in any auth mode.
assert.doesNotMatch(routeSource, /runThingEvidenceDossierStagingTargets|XAI_API_KEY|xai-dossier-fill/);
assert.match(routeSource, /runBotPrimarySeedTargets\(targets/);

assert.equal(parsePassBOperatorOffset(undefined), 0);
assert.throws(() => parsePassBOperatorOffset(-1), (e) => e.statusCode === 400);
assert.throws(() => parsePassBOperatorOffset(1.5), (e) => e.statusCode === 400);
assert.throws(() => parsePassBOperatorOffset(Number.NaN), (e) => e.statusCode === 400);

assert.equal(operatorPassBTimeBudgetMs(undefined), 45000);
assert.equal(operatorPassBTimeBudgetMs(999999), 45000);
assert.equal(operatorPassBTimeBudgetMs(30000), 30000);

const operatorDefault = await resolvePassBOperatorTargets({}, { authMode: 'operator' });
assert.equal(operatorDefault.targets.length, 1);
assert.equal(operatorDefault.batch.nextOffset, 1);

const operatorHugeLimit = await resolvePassBOperatorTargets({ offset: 3, limit: 500 }, { authMode: 'operator' });
assert.equal(operatorHugeLimit.targets.length, 1);
assert.equal(operatorHugeLimit.batch.offset, 3);
assert.equal(operatorHugeLimit.batch.nextOffset, 4);
assert.equal(operatorHugeLimit.targets[0].placeId, shared[3].placeId);

const operatorExhausted = await resolvePassBOperatorTargets({ offset: 100 }, { authMode: 'operator' });
assert.equal(operatorExhausted.targets.length, 0);
assert.equal(operatorExhausted.batch.nextOffset, null);

const store = {
  rows: new Map(),
  async getDossier(key) {
    return structuredClone(this.rows.get(key) || null);
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
useThingEvidenceDossierStore(store);
__setDossierFillTestImpls({
  gatherImpl: async (place) => ({
    thing: place.title,
    pages: [page(`https://example.com/${place.id}`, `${place.title} saved page with enough words for dossier capture.`)],
    attempts: [{ kind: 'page', status: 'ok', at: new Date().toISOString() }],
  }),
  buildImpl: async () => ({
    payload: {},
    structuredText: '{}',
    findings: {
      summary: { value: 'Summary with enough words to satisfy the dossier summary field quality gate for tests.' },
      description: { value: 'Description with enough words to satisfy the dossier description field quality gate for tests and more.' },
    },
  }),
  judgeImpl: async () => [],
  extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
});

async function post(body, token = 'operator-secret') {
  let json = null;
  let status = 0;
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  }, {
    statusCode: 0,
    setHeader() {},
    end(payload) {
      status = this.statusCode;
      json = JSON.parse(String(payload));
    },
  });
  return { status, json };
}

const denied = await post({ offset: 0, limit: 1 }, 'not-the-token');
assert.equal(denied.status, 401);

const badOffset = await post({ offset: -2 });
assert.equal(badOffset.status, 400);

const savedDb = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
const noDbMetrics = await post({ metrics: true });
assert.equal(noDbMetrics.status, 503);
assert.equal(noDbMetrics.json.code, 'missing_database');
process.env.DATABASE_URL = savedDb;

await assert.rejects(
  () => computePassBDossierMetrics({ env: {} }),
  (error) => error.code === 'missing_database' && error.statusCode === 503,
);

process.env.XAI_API_KEY = '';
const noXai = await post({ offset: 0, limit: 1 });
// #747: no xAI key is needed; the route never asks for one.
assert.notEqual(noXai.json.code, 'missing_xai_api_key');
assert.equal(noXai.json.xaiCalled, 0);
process.env.XAI_API_KEY = 'test';

const workerBatchOne = await post({
  usePassBInventory: true,
  offset: 0,
  limit: 2,
  enableTestImpls: true,
}, 'worker-secret');
assert.equal(workerBatchOne.json.ok, true);
assert.equal(workerBatchOne.json.batch.total, 77);
assert.equal(workerBatchOne.json.results.length, 2);

const workerBatchTwo = await post({
  usePassBInventory: true,
  offset: 2,
  limit: 2,
  enableTestImpls: true,
}, 'worker-secret');
assert.equal(workerBatchTwo.json.batch.offset, 2);
assert.equal(workerBatchTwo.json.results.length, 2);

const operatorResolved = await resolvePassBOperatorTargets({ offset: 0, limit: 4 }, { authMode: 'operator' });
assert.equal(operatorResolved.source, 'passb-trip');
assert.equal(operatorResolved.batch.total, 94);
assert.equal(operatorResolved.targets.length, 1);

const fillRun = await runThingEvidenceDossierStagingTargets([shared[6]], {
  env: { XAI_API_KEY: 'test', TIMESYNCHER_DOSSIER_TEST_IMPLS: '1' },
  storeImpl: store,
});
assert.equal(fillRun.ok, true);
assert.ok(fillRun.results[0].pageCount >= 1);
for (const row of fillRun.results) {
  const saved = await store.getDossier(row.dossierKey);
  assert.ok(saved?.attempts?.length);
}

const operatorExhaustedPost = await post({ offset: 100 });
assert.equal(operatorExhaustedPost.status, 200);
assert.equal(operatorExhaustedPost.json.ok, true);
assert.deepEqual(operatorExhaustedPost.json.results, []);
assert.equal(operatorExhaustedPost.json.batch.nextOffset, null);

const ignoreInjectedTargets = await resolvePassBOperatorTargets({
  offset: 5,
  targets: [{ placeId: 99999, title: 'Injected', category: 'restaurant' }],
  allMissing: true,
}, { authMode: 'operator' });
assert.equal(ignoreInjectedTargets.targets[0].placeId, shared[5].placeId);

const metrics = await computePassBDossierMetrics({ env: process.env, storeImpl: store });
assert.equal(metrics.passBSharedInventory.byType.restaurant, 25);
assert.equal(metrics.dossierStore.source, 'central');
assert.ok(metrics.dossierStore.withPages >= 4);
assert.equal(metrics.byType.restaurant.total, 25);

const metricsPost = await post({ metrics: true });
assert.equal(metricsPost.json.passBSharedInventory.total, 77);
assert.equal(metricsPost.json.inventory.byType.restaurant, 25);

console.log('test_dossier_server_fill_687: ok');
