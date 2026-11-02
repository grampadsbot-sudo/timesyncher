import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { prepareOperatorDossierGather } from '../src/vacation/xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { createDossierFillTrace, recordDossierTracePages } from '../src/vacation/dossier-fill-trace.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { page, field, judge } from './lib/dossier-round4-test-support.mjs';

for (const [title, mention, count] of [
  ["Junior's Times Square", 'JUNIOR’S', 5],
  ['Angelina Bakery Broadway', 'Angelina Bakery', 5],
  ["Carmine's Times Square", 'Carmine’s', 1],
  ["Sylvia's Harlem", 'Sylvia’s', 1],
  ['The Jazz Club at Aman New York', 'Jazz Club at Aman New York', 1],
]) test(`G5 ${count} saved pages for ${title} survive normalization and reuse to presented text`, async () => {
  const place = { tripId: 'offline-trip', placeId: title, title, category: 'restaurant' };
  const facts = `${mention} serves grilled fish and seasonal vegetables beside the waterfront. Its lunch menu includes a daily fish dish alongside seasonal plates. Tables face the water and the entrance is on the harbor walkway. Nearby venues include Harbor Restaurant and Sunset Bar.`;
  const summary = `${title} serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.`;
  const description = `${title} serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Tables face the water, with an entrance on the harbor walkway. Lunch choices include the daily fish dish and the seasonal vegetable plates.`;
  const raw = { thing: title, pages: Array.from({ length: count }, (_, i) => page(facts, i)), fields: {}, attempts: [{ kind: 'page', status: 'ok' }] };
  const trace = createDossierFillTrace();
  const normalized = normalizeDossierEvidence(raw, place, trace);
  assert.equal(normalized.pages.length, count);
  const prepared = await prepareOperatorDossierGather(raw, place, { reuseSavedPages: true, trace });
  assert.equal(prepared.retryEmptyGather, false);
  assert.equal(trace.gather.path, 'reuse');
  assert.equal(trace.pagesVerified, true);
  assert.deepEqual(trace.pageRepairs, []);
  const storeImpl = memoryStore(), key = `trip:offline-trip:place:${title}`;
  storeImpl.rows.set(key, raw);
  let builds = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env: {}, storeImpl, dossierKey: key, forceRefresh: true, reuseSavedPages: true, trace,
    gatherImpl: async () => assert.fail('saved pages must be reused'),
    fetchImpl: async () => assert.fail('offline reuse must not search'),
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (dossier) => {
      builds += 1;
      assert.equal(dossier.pages.length, count);
      return { findings: { summary: field(summary), description: field(description) } };
    }, judgeImpl: judge,
  });
  assert.equal(result.failed, undefined);
  assert.equal(builds, 1);
  assert.equal(dossierPresented(result.parsed.evidenceDossier, place), true);
  assert.equal(trace.builder.blankedBy, null);
});

test('an actual other-venue page is excluded with its real reason and citations remapped', () => {
  const place = { title: "Junior's Times Square", category: 'restaurant' };
  const other = page('Sunset Restaurant serves oysters by the beach.', 0);
  const ours = page('Junior’s serves cheesecake. Nearby Sunset Restaurant serves oysters.', 1);
  const raw = { pages: [other, ours], fields: { price: { value: 12, claims: [{ text: 'Cheesecake price', pages: ['p2'] }] } } };
  const trace = createDossierFillTrace();
  const normalized = normalizeDossierEvidence(raw, place, trace);
  assert.deepEqual(normalized.pages, [ours]);
  assert.deepEqual(normalized.fields.price.claims[0].pages, ['p1']);
  assert.deepEqual(trace.pageRepairs, [{ index: 0, reason: 'other_venue', action: 'excluded' }]);
  const emptyTrace = createDossierFillTrace();
  const empty = normalizeDossierEvidence({ pages: [other] }, place, emptyTrace);
  recordDossierTracePages(emptyTrace, { pages: [other] }, empty);
  assert.equal(empty.pages.length, 0);
  assert.equal(emptyTrace.builder.blankedBy, 'other_venue');
  assert.deepEqual(emptyTrace.firstFailingPage, { index: 0, reason: 'other_venue' });
});

test('excluded search snippets are not silently re-added after identity filtering', () => {
  const trace = createDossierFillTrace();
  const result = normalizeDossierEvidence({ pages: [], braveResults: [{ url: 'https://other.example/', title: 'Sunset Restaurant', snippets: ['Sunset Restaurant serves oysters.'] }] }, { title: 'Harbor Bistro', category: 'restaurant' }, trace);
  assert.equal(result.pages.length, 0);
  assert.ok(trace.pageRepairs.some((p) => p.reason === 'other_venue'));
});
