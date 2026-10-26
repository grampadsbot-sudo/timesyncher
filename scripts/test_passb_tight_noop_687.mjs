#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { dossierFillRebuildFields, dossierPersistedFillIsNoOp } from '../src/vacation/xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

const place = { id: 'tight-noop', title: 'Harbor Bookshop', name: 'Harbor Bookshop', category: 'store' };
const target = { ...place, tripId: 'unit-trip', placeId: place.id };
const dossierKey = tripPlaceDossierKey(target.tripId, place.id);
const summary = 'Harbor Bookshop offers a quiet place to browse local history books and staff selections by the harbor.';
const description = 'Harbor Bookshop stocks local history books, fiction, and maps in a small shop beside the harbor. Staff selections help visitors choose books about the surrounding area. The shop has a quiet reading corner and shelves of travel guides, with books arranged by subject for browsing during a visit.';
const claim = () => ({ text: 'Harbor Bookshop stocks local history books.', pages: ['p1'], supported: true });
const field = (value) => ({ value, claims: [claim()] });
const text = `${summary} ${description}`;
const evidence = {
  url: 'https://bookshop.example/about', text, fetchedAt: '2026-10-26T12:00:00.000Z',
  sha256: createHash('sha256').update(text).digest('hex'),
};
const complete = {
  thing: place.title, pages: [evidence],
  attempts: [{ kind: 'page', url: evidence.url, status: 'ok', startedAt: evidence.fetchedAt }],
  fields: { summary: field(summary), description: field(description) },
  captureCheckpoint: 'done',
};
function stored(dossier) {
  const { hashes, sources } = computeDossierFieldHashes(dossier);
  return { ...structuredClone(dossier), fieldHashes: hashes, fieldSources: sources };
}
function memoryStore(dossier) {
  const rows = new Map(dossier ? [[dossierKey, stored(dossier)]] : []);
  return {
    async getDossier(key) { return structuredClone(rows.get(key) || null); },
    async putDossier(key, value) { rows.set(key, stored(value)); },
  };
}
const env = { XAI_API_KEY: 'unit-test', BRAVE_SEARCH_API_KEY: 'unit-test' };
const judgeImpl = async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true }));
const extractReviewsImpl = async () => ({ reviews: [], keep: [] });
const noNetwork = async () => { throw new Error('unexpected provider request'); };
const goodBuild = async () => ({ payload: {}, structuredText: '{}', findings: { summary: field(summary), description: field(description) } });
function emptyGather() {
  return { thing: place.title, pages: [], braveResults: [], attempts: [{ kind: 'brave', step: 'match', status: 'no_match' }] };
}

test('rule 1: timed-out empty gather is a hard failure with a persisted named reason', async () => {
  const storeImpl = memoryStore();
  let searches = 0;
  const realNow = Date.now;
  let clock = 1000;
  Date.now = () => clock;
  try {
    const result = await fetchXaiPlaceRatings(place, {
      dossierKey, env, storeImpl, timeBudgetMs: 1,
      gatherImpl: async () => { clock += 2; return emptyGather(); },
      fetchImpl: async () => { searches += 1; return { ok: true, json: async () => ({ web: { results: [] } }) }; },
      buildImpl: async () => { assert.fail('no builder without saved pages'); },
    });
    assert.equal(searches, 1, 'one broader search even when the original gather exhausted the budget');
    assert.equal(result.failed, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.emptySource, 'brave_no_match');
    assert.equal(result.parsed.evidenceDossier.captureCheckpoint, 'after_gather');
    assert.equal((await storeImpl.getDossier(dossierKey)).emptySource, 'brave_no_match');
  } finally { Date.now = realNow; }
});

test('rule 2: weak summary, description, and presented-only defects force a full text builder on saved pages', async () => {
  for (const [label, fields] of [
    ['summary', { ...complete.fields, summary: field('Short note') }],
    ['description', { ...complete.fields, description: field('Harbor Bookshop sells books.') }],
    ['presented', { ...complete.fields, summary: field(`Option: ${summary}`) }],
  ]) {
    const weak = stored({ ...complete, fields });
    assert.equal(dossierPresented(weak, place), false, label);
    assert.equal(dossierPersistedFillIsNoOp(weak, weak, place), false, label);
    const rebuildFields = dossierFillRebuildFields(weak, weak, place);
    assert.ok(rebuildFields.has('summary') && rebuildFields.has('description'), label);
    const storeImpl = memoryStore(weak);
    let builds = 0;
    const result = await runThingEvidenceDossierStagingTargets([target], {
      env, storeImpl, operatorFill: true, skipExisting: true,
      gatherImpl: async () => { assert.fail('saved pages must be reused'); },
      fetchImpl: noNetwork, extractReviewsImpl, judgeImpl,
      buildImpl: async (dossier, options) => {
        builds += 1;
        assert.equal(options.reviewsOnly, false);
        assert.ok(dossier.pages.some((page) => page.sha256 === evidence.sha256));
        return goodBuild();
      },
    });
    const row = result.results[0];
    assert.equal(builds, 1, label);
    assert.equal(row.failed, false, label);
    assert.equal(row.skipped, undefined, label);
    assert.equal(row.pagesAdded, 0, 'a text rebuild must not claim new pages');
    assert.equal(dossierPresented(await storeImpl.getDossier(dossierKey), place), true, label);
  }
});

test('rules 1 and 2: an ineffective or judge-rejected rebuild returns a hard failure', async () => {
  for (const reject of [false, true]) {
    const storeImpl = memoryStore({ ...complete, fields: {} });
    const result = await runThingEvidenceDossierStagingTargets([target], {
      env, storeImpl, operatorFill: true, skipExisting: true,
      gatherImpl: async () => { assert.fail('no re-gather'); },
      fetchImpl: noNetwork, extractReviewsImpl,
      buildImpl: reject ? goodBuild : async () => ({ payload: {}, structuredText: '{}', findings: {} }),
      judgeImpl: reject ? async () => [] : judgeImpl,
    });
    assert.equal(result.results[0].failed, true);
    assert.equal(result.results[0].status, 'failed');
    assert.equal(result.results[0].error, 'presented_fields_not_ok');
    assert.equal(result.results[0].skipped, undefined);
    assert.equal(result.results[0].pagesAdded, 0);
  }
});

test('rule 3: one broader search can recover empty gather and build only from its saved page', async () => {
  const storeImpl = memoryStore();
  const queries = [];
  let builds = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env, storeImpl, dossierKey, destination: 'Boston', gatherImpl: async () => emptyGather(),
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      assert.ok(parsed.pathname.endsWith('/web/search'));
      queries.push(parsed.searchParams.get('q'));
      return { ok: true, json: async () => ({ web: { results: [{ url: evidence.url, title: place.title, description: text }] } }) };
    },
    buildImpl: async (dossier) => {
      builds += 1;
      assert.equal(dossier.pages[0].url, evidence.url);
      assert.ok(dossier.pages[0].text.includes(description));
      return goodBuild();
    },
    judgeImpl, extractReviewsImpl,
  });
  assert.deepEqual(queries, ['Harbor Bookshop Boston']);
  assert.equal(builds, 1);
  assert.notEqual(result.failed, true);
  assert.equal(result.parsed.evidenceDossier.emptySource, null);
  const attempt = result.parsed.evidenceDossier.attempts.find((row) => row.step === 'empty_gather_escalation');
  assert.equal(attempt.status, 'ok');
  assert.equal(attempt.provider, 'Brave');
  assert.ok(attempt.startedAt);
});

test('rules 1 and 3: exhausted broader search returns a hard operator failure', async () => {
  let searches = 0;
  const result = await runThingEvidenceDossierStagingTargets([target], {
    env, storeImpl: memoryStore(), operatorFill: true, gatherImpl: async () => emptyGather(),
    fetchImpl: async () => { searches += 1; return { ok: true, json: async () => ({ web: { results: [] } }) }; },
    buildImpl: async () => { assert.fail('no builder without pages'); },
  });
  assert.equal(searches, 1);
  assert.equal(result.results[0].failed, true);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].emptySource, 'brave_no_match');
  assert.equal(result.results[0].pagesAdded, 0);
});

test('rule 3: an empty web gather without a local no-match still escalates once', async () => {
  let searches = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env, storeImpl: memoryStore(), dossierKey,
    gatherImpl: async () => ({
      thing: place.title, pages: [], braveResults: [],
      attempts: [{ kind: 'brave', step: 'web_search', status: 'ok', results: 0 }],
    }),
    fetchImpl: async () => { searches += 1; return { ok: true, json: async () => ({ web: { results: [] } }) }; },
    buildImpl: async () => { assert.fail('no pages to build from'); },
  });
  assert.equal(searches, 1);
  assert.equal(result.failed, true);
  assert.equal(result.emptySource, 'brave_zero_hits');
});

test('rule 2: the default saved-page path cannot return after a reviews-only rebuild with bad text', async () => {
  const weak = { ...complete, fields: { ...complete.fields, summary: field('Short note') } };
  let builds = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env, storeImpl: memoryStore(weak), dossierKey,
    gatherImpl: async () => { assert.fail('reuse saved pages'); },
    fetchImpl: async () => ({ ok: true, json: async () => ({ web: { results: [] } }) }),
    extractReviewsImpl, judgeImpl,
    buildImpl: async (_dossier, options) => {
      builds += 1;
      assert.equal(options.reviewsOnly, false);
      return goodBuild();
    },
  });
  assert.equal(builds, 1);
  assert.equal(dossierPresented(result.parsed.evidenceDossier, place), true);
  assert.notEqual(result.skipped, true);
});

test('rule 1: the builder response itself reports unusable text as failed', async () => {
  const result = await fetchXaiPlaceRatings(place, {
    env, storeImpl: memoryStore(), dossierKey,
    gatherImpl: async () => structuredClone(complete),
    buildImpl: async () => ({ payload: {}, structuredText: '{}', findings: {} }),
    judgeImpl, extractReviewsImpl, fetchImpl: noNetwork,
  });
  assert.equal(result.failed, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'presented_fields_not_ok');
});
