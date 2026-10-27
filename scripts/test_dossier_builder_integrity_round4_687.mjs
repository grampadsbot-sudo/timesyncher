import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { createDossierFillTrace } from '../src/vacation/dossier-fill-trace.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { target, page, findings, judge } from './lib/dossier-round4-test-support.mjs';

for (const size of [1, 5]) for (const corrupt of ['sha256', 'fetchedAt', 'empty']) test(`R1 ${size}-page ${corrupt} repair/exclusion preserves supported text`, async () => {
  const storeImpl = memoryStore();
  const pages = Array.from({ length: size }, (_, index) => page(undefined, index));
  const badIndex = size === 1 ? 0 : 2;
  if (corrupt === 'empty') pages[badIndex].text = '';
  else pages[badIndex][corrupt] = 'invalid-fixture-metadata';
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, pages, fields: {}, attempts: [{ kind: 'page', status: 'ok' }] });
  let gathers = 0;
  const trace = createDossierFillTrace();
  const result = await fetchXaiPlaceRatings(target, {
    env: {}, storeImpl, dossierKey: key, reuseSavedPages: true, forceRefresh: true, trace,
    gatherImpl: async () => { gathers += 1; return { thing: target.title, pages: [page()], attempts: [{ kind: 'page', status: 'ok' }] }; },
    fetchImpl: async () => assert.fail('offline fixture'),
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (dossier, { prompt }) => {
      assert.ok(dossier.pages.every((row) => row.text && Number.isFinite(Date.parse(row.fetchedAt))));
      const model = JSON.parse(prompt.split('\n').at(-1));
      assert.ok(model.pages.every((row) => row.text.includes('Harbor Bistro')));
      return { findings: findings(), structuredText: JSON.stringify(findings()) };
    },
    judgeImpl: judge,
  });
  assert.equal(result.failed, undefined);
  assert.equal(dossierPresented(result.parsed.evidenceDossier, target), true);
  const saved = normalizeDossierEvidence(await storeImpl.getDossier(key), target);
  assert.equal(dossierPresented(saved, target), true, 'persisted citations still resolve after exclusion/rehash');
  assert.equal(gathers, size === 1 && corrupt !== 'sha256' ? 1 : 0);
  assert.equal(trace.pagesVerified, true);
  const reason = corrupt === 'sha256' ? 'sha256_mismatch' : corrupt === 'fetchedAt' ? 'invalid_fetched_at' : 'empty_text';
  assert.deepEqual(trace.firstFailingPage, { index: badIndex, reason });
  assert.ok(trace.pageRepairs.some((row) => row.index === badIndex && row.action === (corrupt === 'sha256' ? 'rehashed' : 'excluded')));
  assert.equal(trace.builder.blankedBy, null);
  assert.match(result.parsed.evidenceDossier.fields.description.value, /No reviews were found/);
});

for (const size of [1, 5]) for (const mode of ['parse-recover', 'parse-fail', 'judge-recover', 'judge-fail', 'empty-output']) test(`R1 ${size}-page ${mode} has a named builder outcome`, async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, fields: {}, pages: Array.from({ length: size }, (_, index) => page(undefined, index)), attempts: [{ kind: 'page', status: 'ok' }] });
  let builds = 0, judges = 0;
  const result = (await runThingEvidenceDossierStagingTargets([target], {
    env: { XAI_API_KEY: 'offline-fixture', XAI_PLACE_SEARCH_MODEL: 'offline-builder' }, operatorFill: true, skipExisting: true, storeImpl,
    gatherImpl: async () => assert.fail('saved evidence is sufficient'),
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/v1/responses');
      const request = JSON.parse(options.body);
      assert.ok(request.input[0].content.includes('Harbor Bistro'));
      builds += 1;
      const malformed = mode === 'parse-fail' || mode === 'parse-recover' && builds === 1;
      const output_text = malformed ? 'A narrative without JSON' : mode === 'empty-output' ? '{}' : JSON.stringify(findings());
      return { ok: true, status: 200, json: async () => ({ output_text }) };
    },
    judgeImpl: async (dossier, claims) => {
      judges += 1;
      if (mode === 'judge-fail' || mode === 'judge-recover' && judges === 1) return claims.map(({ id }) => ({ id, supported: false, reason: 'The fixture deliberately rejects this attempt.' }));
      return judge(dossier, claims);
    },
    extractReviewsImpl: async () => ({ reviews: [] }),
  })).results[0];
  assert.equal(builds, 2, 'one bounded repair call');
  const success = mode.endsWith('recover');
  assert.equal(result.failed, !success);
  const trace = result.trace;
  assert.equal(trace.gather.path, 'reuse');
  assert.equal(trace.pages.raw, size);
  assert.equal(trace.pages.normalized, size);
  assert.equal(trace.pagesVerified, true);
  assert.equal(trace.builder.ran, true);
  assert.ok(trace.builder.structuredTextChars > 0);
  assert.equal(trace.builder.attempts.length, 2);
  assert.equal(trace.builder.attempts[0].blankedBy, mode.startsWith('parse') ? 'parse_error' : mode.startsWith('judge') ? 'judge_rejected_all' : 'empty_model_output');
  assert.equal(trace.builder.blankedBy, success ? null : mode === 'parse-fail' ? 'parse_error' : mode === 'judge-fail' ? 'judge_rejected_all' : 'empty_model_output');
  assert.equal(trace.builder.jsonParsed, mode !== 'parse-fail');
  if (mode === 'judge-fail') assert.equal(trace.builder.judgeUnsupported, 2);
  if (success) assert.equal(trace.builder.judgeSupported, 2);
  if (!success) assert.ok(result.presentedReasons.includes('blank_summary'));
});

test('a builder blank is retried on the next operator call; three failures back off, then resume', async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, fields: {}, pages: [page()], attempts: [{ kind: 'page', status: 'ok' }] });
  let builds = 0;
  let recover = false;
  const options = {
    env: {}, operatorFill: true, skipExisting: true, storeImpl,
    gatherImpl: async () => assert.fail('reuse'), fetchImpl: async () => assert.fail('offline'),
    buildImpl: async () => { builds += 1; return { findings: recover ? findings() : {} }; }, judgeImpl: judge,
    extractReviewsImpl: async () => ({ reviews: [] }),
  };
  for (let count = 1; count <= 3; count += 1) {
    const row = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
    assert.equal(row.failed, true);
    assert.equal(row.trace.builder.blankedBy, 'empty_model_output');
    assert.equal(builds, count * 2);
  }
  const held = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
  assert.equal(builds, 6);
  assert.equal(held.trace.gather.gate, 'text_retry_backoff');
  assert.equal(held.trace.builder.ran, false);
  const saved = await storeImpl.getDossier(key);
  saved.attempts.findLast((row) => row.step === 'operator_presented_text_retry').nextEligibleAt = '2020-01-01T00:00:00Z';
  await storeImpl.putDossier(key, saved);
  recover = true;
  const repaired = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
  assert.equal(repaired.failed, false);
  assert.equal(builds, 7);
});

test('the independent judge receives the saved factual bytes used by the builder', async () => {
  const detail = 'Waterfront dining room. Grilled fish with seasonal vegetables. Lunch and dinner. Harbor walkway entrance. Tables facing the water. Daily fish lunch dish alongside seasonal plates.';
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, fields: {}, pages: [page(detail)], attempts: [{ kind: 'page', status: 'ok' }] });
  const trace = createDossierFillTrace();
  let judges = 0;
  const result = await fetchXaiPlaceRatings(target, {
    env: { XAI_API_KEY: 'offline-fixture', XAI_PLACE_SEARCH_MODEL: 'offline-judge' },
    storeImpl, dossierKey: key, reuseSavedPages: true, forceRefresh: true, trace,
    gatherImpl: async () => assert.fail('reuse'), extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async () => ({ findings: findings() }),
    fetchImpl: async (_url, options) => {
      const prompt = JSON.parse(options.body).input[0].content;
      const input = JSON.parse(prompt.split('\n').at(-1));
      assert.ok(input.claims.length);
      judges += 1;
      const supported = input.pages.some((row) => row.text.includes(detail));
      return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify({ results: input.claims.map(({ id }) => ({ id, supported })) }) }) };
    },
  });
  assert.equal(result.failed, undefined);
  assert.equal(judges, 1);
  assert.equal(dossierPresented(result.parsed.evidenceDossier, target), true);
  assert.equal(trace.builder.judgeSupported, 2);
});

test('provider builder errors use the same persistent retry budget and emit a safe named trace failure', async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, fields: {}, pages: [page()], attempts: [{ kind: 'page', status: 'ok' }] });
  let builds = 0;
  const options = {
    env: {}, operatorFill: true, skipExisting: true, storeImpl,
    fetchImpl: async () => assert.fail('offline'), gatherImpl: async () => assert.fail('reuse'),
    buildImpl: async () => { builds += 1; throw Object.assign(new Error('offline builder failure'), { status: 401, step: 'builder' }); },
    extractReviewsImpl: async () => ({ reviews: [] }), judgeImpl: judge,
  };
  for (let count = 1; count <= 3; count += 1) {
    const row = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
    assert.equal(builds, count);
    assert.equal(row.failed, true);
    assert.equal(row.trace.builder.failure, 'builder_http_401');
  }
  const held = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
  assert.equal(builds, 3);
  assert.equal(held.trace.gather.gate, 'text_retry_backoff');
  assert.equal(held.trace.builder.ran, false);
});
