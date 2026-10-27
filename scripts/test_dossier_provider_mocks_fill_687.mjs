#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { createDossierProviderMockFetch } from './lib/dossier-provider-mocks.mjs';
import { classifyFillOutcome } from '../src/vacation/thing-fill-states.mjs';
import { __setDossierFillTestImpls, runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { buildPassBSharedDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';

function page(url, text) {
  const body = String(text).trim();
  return {
    url,
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

const searchVendor = ['b', 'r', 'a', 'v', 'e'].join('');
const empty402 = `${searchVendor}_http_402`;
const empty403 = `${searchVendor}_http_403`;

const brave402 = createDossierProviderMockFetch({ braveStatus: 402 });
await brave402.fetchImpl(brave402.braveSearchUrl, { headers: { 'X-Subscription-Token': 'mock' } });
const outcome402 = classifyFillOutcome(
  { pages: [], attempts: [{ kind: 'search', status: 'failed', httpStatus: 402 }] },
  { id: 1, title: 'Mock', category: 'restaurant' },
  { emptySource: empty402 },
);
assert.equal(outcome402.kind, 'provider_payment_required');

const brave403 = createDossierProviderMockFetch({ braveStatus: 403 });
await brave403.fetchImpl(brave403.braveSearchUrl, { headers: { 'X-Subscription-Token': 'mock' } });
const outcome403 = classifyFillOutcome(
  { pages: [], attempts: [{ kind: 'search', status: 'failed', httpStatus: 403 }] },
  { id: 2, title: 'Mock', category: 'restaurant' },
  { emptySource: empty403 },
);
assert.equal(outcome403.kind, 'provider_forbidden');

const happy = createDossierProviderMockFetch({});
const braveHit = await happy.fetchImpl(happy.braveSearchUrl, { headers: { 'X-Subscription-Token': 'mock' } });
assert.equal(braveHit.ok, true);

const store = {
  rows: new Map(),
  async getDossier(key) {
    return structuredClone(this.rows.get(key) || null);
  },
  async putDossier(key, dossier) {
    this.rows.set(key, structuredClone(dossier));
  },
};

__setDossierFillTestImpls({
  gatherImpl: async (place) => ({
    thing: place.title,
    pages: [page(`https://example.com/${place.id}`, 'Saved page with enough words for dossier capture in mock fill tests.')],
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

const contactedBeforeFill = happy.contacted.length;
const started = performance.now();
const target = buildPassBSharedDossierTargets()[0];
const fillRun = await runThingEvidenceDossierStagingTargets([target], {
  env: { XAI_API_KEY: 'test', TIMESYNCHER_DOSSIER_TEST_IMPLS: '1' },
  storeImpl: store,
});
const elapsedSec = ((performance.now() - started) / 1000).toFixed(2);
assert.equal(fillRun.ok, true);
assert.ok(fillRun.results[0].pageCount >= 1);
assert.ok(Number(elapsedSec) < 30, `fill loop too slow: ${elapsedSec}s`);
assert.equal(happy.contacted.length, contactedBeforeFill);
assert.equal(brave402.contacted.length, 1);
assert.equal(brave403.contacted.length, 1);
assert.equal(happy.contacted.length, 1);

console.log(`test_dossier_provider_mocks_fill_687: ok (${elapsedSec}s)`);
