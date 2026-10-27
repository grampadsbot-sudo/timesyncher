#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { dossierFillRebuildFields } from '../src/vacation/xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

const env = { XAI_API_KEY: 'unit-test', BRAVE_SEARCH_API_KEY: 'unit-test' };
const place = { id: 'port-noop', title: 'Harbor Bookshop', category: 'store' };
const key = tripPlaceDossierKey('port-trip', place.id);
const summary = 'Harbor Bookshop offers a quiet place to browse local history books and staff selections by the harbor.';
const description = 'Harbor Bookshop stocks local history books, fiction, and maps in a small shop beside the harbor. Staff selections help visitors choose books about the surrounding area. The shop has a quiet reading corner and shelves of travel guides, with books arranged by subject for browsing during a visit.';
const text = `${summary} ${description}`;
const page = {
  url: 'https://bookshop.example/about', text,
  sha256: createHash('sha256').update(text).digest('hex'),
  fetchedAt: '2026-10-26T12:00:00.000Z',
};
const field = (value) => ({ value, url: page.url, claims: [{ text: 'Harbor Bookshop', pages: ['p1'], supported: true }] });
const unexpected = async () => { assert.fail('unexpected gather, builder, or provider request'); };
function memoryStore(initial) {
  let saved;
  const store = {
    async getDossier() { return structuredClone(saved); },
    async putDossier(_key, value) {
      const { hashes, sources } = computeDossierFieldHashes(value);
      saved = structuredClone({ ...value, fieldHashes: hashes, fieldSources: sources });
    },
  };
  store.putDossier(key, initial);
  return store;
}

test('port: flight, car, and decision keep hash-driven rebuilds during operator fill', async () => {
  for (const category of ['flight', 'car', 'decision']) {
    const light = { ...place, category };
    const storeImpl = memoryStore({
      thing: place.title, pages: [page], attempts: [],
      fields: { summary: field('Short note'), description: field('Short details'), price: field(40) },
    });
    const saved = await storeImpl.getDossier(key);
    assert.equal(dossierFillRebuildFields(saved, saved, light).size, 0, category);
    const changed = { ...saved, pages: [{ ...page, sha256: 'changed-page-hash' }] };
    assert.ok(dossierFillRebuildFields(saved, changed, light).has('summary'), category);
    const result = await runThingEvidenceDossierStagingTargets([{
      ...light, tripId: 'port-trip', placeId: place.id, dossierKey: key,
    }], {
      env, storeImpl, operatorFill: true, skipExisting: true,
      gatherImpl: unexpected, buildImpl: unexpected, fetchImpl: unexpected,
    });
    assert.equal(result.results[0].skipped, 'existing_dossier', category);
    assert.equal(result.results[0].trace.gather.path, 'skipped-noop');
    assert.equal(result.results[0].trace.builder.ran, false);
    assert.notEqual(result.results[0].failed, true, category);
  }
});

test('port: attempts-only light dossiers fail before skip and do not restart exhausted gap searches', async () => {
  const light = { ...place, category: 'car' };
  const storeImpl = memoryStore({
    thing: place.title, pages: [], emptySource: 'gather_no_pages',
    attempts: [{ kind: 'brave', step: 'web_search', status: 'ok', results: 0 }],
    fields: { summary: { value: 'Short note', claims: [] } },
  });
  let searches = 0;
  const options = {
    env, storeImpl, dossierKey: key,
    gatherImpl: unexpected, buildImpl: unexpected,
    fetchImpl: async () => {
      searches += 1;
      return { ok: true, json: async () => ({ web: { results: [] } }) };
    },
  };
  let firstSearches = 0;
  for (let round = 0; round < 2; round += 1) {
    const result = await fetchXaiPlaceRatings(light, options);
    assert.equal(result.failed, true);
    assert.equal(result.status, 'failed');
    assert.ok(result.emptySource);
    assert.equal(result.error, result.emptySource);
    assert.equal(result.skipped, undefined);
    assert.equal(result.parsed.evidenceDossier.pages.length, 0);
    assert.equal((await storeImpl.getDossier(key)).emptySource, result.emptySource);
    if (round === 0) firstSearches = searches;
    assert.ok(firstSearches > 0);
    assert.equal(searches, firstSearches, 'exhausted gaps must not be searched again');
    const gaps = result.parsed.evidenceDossier.attempts.filter((attempt) => attempt.kind === 'gap_top_up');
    for (const name of new Set(gaps.map((attempt) => attempt.field))) {
      assert.ok(gaps.filter((attempt) => attempt.field === name).length <= 3, name);
    }
  }
});

test('port: attempts-only gather resumes gap search, clears emptySource only after saving pages, and builds text', async () => {
  const storeImpl = memoryStore({
    thing: place.title, pages: [], fields: {}, emptySource: 'gather_no_pages',
    attempts: [{ kind: 'brave', step: 'web_search', status: 'ok', results: 0 }],
  });
  let searches = 0;
  let builds = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env, storeImpl, dossierKey: key, gatherImpl: unexpected,
    fetchImpl: async (url) => {
      assert.ok(new URL(url).pathname.endsWith('/web/search'));
      searches += 1;
      return { ok: true, json: async () => ({ web: { results: [{ url: page.url, title: place.title, description: text }] } }) };
    },
    buildImpl: async (dossier, options) => {
      builds += 1;
      assert.equal(options.reviewsOnly, false);
      assert.ok(dossier.pages.length > 0);
      assert.ok(dossier.attempts.some((attempt) => attempt.kind === 'gap_top_up'));
      assert.equal(dossier.emptySource, null);
      return { findings: { summary: field(summary), description: field(description) }, structuredText: '{}', payload: {} };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true })),
    extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
  });
  assert.ok(searches > 0);
  assert.equal(builds, 1);
  assert.notEqual(result.failed, true);
  assert.equal(result.parsed.evidenceDossier.emptySource, null);
  assert.equal(dossierPresented(await storeImpl.getDossier(key), place), true);
});
