#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import handler from '../routes/thing-evidence-dossiers.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
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
    this.rows.set(key, JSON.parse(JSON.stringify(dossier)));
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

const complete = {
  thing: 'Carbone',
  pages: [page('https://example.com/a', 'review text ' + 'word '.repeat(50))],
  attempts: [],
  fields: { summary: { value: 'Carbone is a classic Italian restaurant in Greenwich Village with red-sauce pastas.', claims: [{ text: 'Italian', pages: ['p1'], supported: true }] } },
  captureCheckpoint: 'done',
};
await store.putDossier(tripPlaceDossierKey(99, 610), complete);
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

const second = await runThingEvidenceDossierStagingTargets([target], {
  env: { XAI_API_KEY: 'test' },
  storeImpl: store,
  skipExisting: true,
  gatherImpl: async () => { gatherCalls += 1; return { pages: [] }; },
  buildImpl: async () => ({ payload: {}, structuredText: '{}', findings: {} }),
});
assert.equal(second.results[0].skipped, 'existing_dossier');
assert.equal(gatherCalls, 0);

let json = null;
await handler({
  method: 'POST',
  headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify({ targets: [target] }));
  },
}, {
  statusCode: 0,
  setHeader() {},
  end(payload) {
    json = JSON.parse(String(payload));
  },
});
assert.equal(json.ok, true);
assert.equal(json.results[0].skipped, 'existing_dossier');

console.log('test_thing_evidence_dossier_worker_route: ok');
