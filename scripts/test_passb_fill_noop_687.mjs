#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import {
  dossierEmptyGatherReason,
  dossierFillRebuildFields,
  dossierPersistedFillIsNoOp,
} from '../src/vacation/xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

function page(url, text) {
  return {
    url,
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

const place = { id: 610, title: 'Test Bistro', name: 'Test Bistro', category: 'restaurant' };
const description = [
  'Test Bistro serves seasonal plates, natural wine, and attentive service in a cozy downtown dining room with candlelit tables.',
  'Guests come for the chef-driven menu, warm hospitality, reliable reservations on busy weekends, thoughtful wine pairings,',
  'and a dessert menu that changes with the seasons.',
].join(' ');
const pageText = `${description} ${description}`;
const claim = { text: 'Test Bistro', pages: ['p1'], supported: true };
const goodSummary = 'Test Bistro is a downtown restaurant known for seasonal plates and attentive wine service.';

const dossier = {
  thing: 'Test Bistro',
  pages: [page('https://testbistro.example/', pageText)],
  attempts: [{ kind: 'builder', status: 'ok', at: '2026-01-01T00:00:00.000Z' }],
  fields: {
    summary: { value: goodSummary, claims: [claim] },
    description: { value: description, claims: [claim] },
  },
};
const { hashes, sources } = computeDossierFieldHashes(dossier);
const persisted = { ...dossier, fieldHashes: hashes, fieldSources: sources };
const weakSummaryDossier = {
  ...persisted,
  fields: {
    ...persisted.fields,
    summary: { value: 'Short note', claims: [claim] },
  },
};

const rebuild = dossierFillRebuildFields(persisted, weakSummaryDossier, place, { changedUrls: [] });
assert.ok(rebuild.has('summary'), 'weak_summary_in_rebuild_fields');
assert.equal(
  dossierPersistedFillIsNoOp(persisted, weakSummaryDossier, place),
  false,
  'weak_summary_not_no_op',
);

const store = {
  rows: new Map(),
  async getDossier(key) {
    return store.rows.get(key) ? JSON.parse(JSON.stringify(store.rows.get(key))) : null;
  },
  async putDossier(key, value) {
    store.rows.set(key, JSON.parse(JSON.stringify(value)));
  },
};

const dossierKey = tripPlaceDossierKey(99, place.id);
await store.putDossier(dossierKey, persisted);

let builderCalls = 0;
const result = await fetchXaiPlaceRatings(place, {
  dossierKey,
  storeImpl: store,
  env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
  timeBudgetMs: 52000,
  gatherImpl: async () => { throw new Error('gather must not run when pages exist'); },
  buildImpl: async () => {
    builderCalls += 1;
    return {
      findings: {
        summary: { value: goodSummary, claims: [claim] },
        description: { value: description, claims: [claim] },
      },
      structuredText: '{}',
      payload: {},
    };
  },
  judgeImpl: async () => ({ supported: [] }),
  extractReviewsImpl: async () => ({ set: {}, stats: {} }),
});
assert.notEqual(result.skipped, true, 'weak_summary_does_not_skip_builder');
assert.ok(builderCalls >= 1, 'weak_summary_runs_builder');

const emptyGathered = {
  thing: 'Ghost Kitchen',
  pages: [],
  attempts: [{ kind: 'brave', step: 'match', status: 'no_match' }],
  braveResults: [],
};
assert.equal(dossierEmptyGatherReason(emptyGathered), 'brave_no_match');

const emptyKey = tripPlaceDossierKey(99, 611);
let gatherCalls = 0;
const emptyResult = await fetchXaiPlaceRatings(
  { id: 611, title: 'Ghost Kitchen', category: 'restaurant' },
  {
    dossierKey: emptyKey,
    storeImpl: store,
    env: { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' },
    timeBudgetMs: 52000,
    gatherImpl: async () => {
      gatherCalls += 1;
      return emptyGathered;
    },
    buildImpl: async () => { throw new Error('builder must not run without pages'); },
  },
);
assert.equal(gatherCalls, 1, 'zero_page_attempts_only_triggers_gather');
assert.equal(emptyResult.emptySource, 'brave_no_match', 'zero_page_named_empty_source');
assert.equal(emptyResult.parsed?.evidenceDossier?.pages?.length || 0, 0);

console.log('test_passb_fill_noop_687: ok');
