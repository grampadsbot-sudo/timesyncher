import assert from 'node:assert/strict';
import { test } from 'node:test';
import { braveWebSearch, runBraveQueries } from '../src/vacation/dossier-brave.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { buildPassBOperatorDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { createDossierFillTrace, recordDossierTraceAttempts } from '../src/vacation/dossier-fill-trace.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { target, summary, description, page, field, findings, judge, webResponse, noSleep } from './lib/dossier-round4-test-support.mjs';

for (const status of [401, 402, 422, 429, 500, 503]) test(`Brave HTTP ${status} is named with bounded retry`, async () => {
  let calls = 0;
  const out = await braveWebSearch('Harbor Bistro Boston', {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: noSleep,
    fetchImpl: async () => { calls += 1; return webResponse([], status); },
  });
  assert.equal(calls, status === 429 || status >= 500 ? 3 : 1);
  const braveAttempts = out.attempts.filter((row) => row.kind === 'brave');
  assert.equal(braveAttempts.length, calls);
  assert.equal(braveAttempts.at(-1).httpStatus, status);
  assert.equal(braveAttempts.at(-1).error, `brave_http_${status}`);
  assert.equal(out.attempts.at(-1).error, 'tavily_missing_key');
});

test('429 then OK honors bounded Retry-After and paces sequential queries', async () => {
  let calls = 0;
  const waits = [];
  const out = await runBraveQueries([{ query: 'Harbor Bistro route', stage: 'general' }, 'Harbor Bistro menu'], {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: async (ms) => waits.push(ms),
    fetchImpl: async () => { calls += 1; return webResponse(calls === 1 ? [] : [{
      url: target.website, title: target.title, description: summary,
    }], calls === 1 ? 429 : 200, calls === 1 ? '1.5' : null); },
  });
  assert.equal(calls, 3);
  assert.deepEqual(out.attempts.map((row) => row.httpStatus), [429, 200, 200]);
  assert.ok(waits[0] >= 1450 && waits[0] <= 1500);
  assert.ok(waits[1] >= 1000 && waits[1] <= 1050);
  assert.equal(out.attempts[0].stage, 'general');
  assert.equal(out.pages.length, 1);
});

for (const mode of ['long-header', 'deadline']) test(`Brave ${mode} refuses a retry outside its cap`, async () => {
  let calls = 0;
  const out = await braveWebSearch(target.title, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: () => assert.fail('cannot sleep past cap'),
    ...(mode === 'deadline' ? { deadline: Date.now() + 100 } : {}),
    fetchImpl: async () => { calls += 1; return webResponse([], 429, mode === 'long-header' ? '60' : null); },
  });
  assert.equal(calls, 1);
  assert.equal(out.attempts[0].httpStatus, 429);
});

test('operator R0 retries current-version exhaustion on the next offset/limit/skipExisting call and traces only that call', async () => {
  const offset = buildPassBOperatorDossierTargets().findIndex((row) => row.category === 'restaurant');
  const { targets, batch } = await resolvePassBOperatorTargets({ offset, limit: 1, skipExisting: true }, { authMode: 'operator' });
  assert.equal(batch.offset, offset);
  assert.equal(targets.length, 1);
  const row = targets[0];
  const storeImpl = memoryStore();
  storeImpl.rows.set(`trip:${row.tripId}:place:${row.placeId}`, {
    thing: row.title, pages: [], fields: {}, emptySource: 'brave_extract_fallback_no_pages', attempts: [
      { kind: 'page', stage: 'extract_fallback', status: 'failed', error: 'brave_extract_fallback_no_pages', query: 'old-query' },
      { kind: 'gather', step: 'operator_empty_gather_retry', gatherVersion: 4, status: 'failed' },
    ],
  });
  let gathers = 0;
  const queries = [];
  const options = {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    fetchImpl: async () => assert.fail('no live provider'),
    gatherImpl: async (place, opts) => {
      gathers += 1;
      return gatherThingEvidence(place, { ...opts, sleepImpl: noSleep, braveImpl: null,
        env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' },
        resolveImpl: async () => [{ address: '93.184.216.34' }],
        extractImpl: async () => { throw new Error('Tavily extract failed with HTTP 432.'); },
        fetchImpl: async (url) => {
          const parsed = new URL(url);
          if (!parsed.pathname.endsWith('/web/search')) return webResponse([], 403);
          const q = parsed.searchParams.get('q'); queries.push(q);
          return webResponse(gathers > 1 && q === row.title ? [{ url: 'https://guide.example/restaurant',
            title: row.title, description: `${summary} ${description}`.replaceAll(target.title, row.title) }] : [], gathers === 1 ? 401 : 200);
        },
      });
    },
    buildImpl: async () => ({ findings: {
      summary: field(summary.replaceAll(target.title, row.title)), description: field(description.replaceAll(target.title, row.title)),
    } }),
    judgeImpl: judge, extractReviewsImpl: async () => ({ reviews: [] }),
  };
  const first = (await runThingEvidenceDossierStagingTargets(targets, options)).results[0];
  assert.equal(gathers, 1);
  assert.equal(first.emptySource, 'brave_http_401+tavily_missing_key');
  assert.equal(first.trace.gather.path, 'retry');
  assert.ok(first.trace.attempts.some((attempt) => attempt.httpStatus === 401));
  assert.ok(first.trace.attempts.some((attempt) => attempt.provider === 'direct' && attempt.httpStatus === 403));
  assert.ok(first.trace.attempts.some((attempt) => attempt.provider === 'Tavily' && attempt.httpStatus === 432));
  assert.ok(first.trace.attempts.every((attempt) => attempt.query !== 'old-query'));
  assert.equal(first.trace.builder.ran, false);
  const second = (await runThingEvidenceDossierStagingTargets(targets, options)).results[0];
  assert.equal(gathers, 2);
  assert.equal(second.failed, false);
  assert.ok(queries.includes(row.title));
  assert.ok(second.trace.attempts.every((attempt) => attempt.httpStatus !== 401));
  assert.equal(second.trace.pagesVerified, true);
  assert.equal(second.trace.builder.blankedBy, null);
  assert.equal(second.trace.builder.jsonParsed, true);
  assert.equal(second.trace.builder.summaryClaims, 1);
  assert.equal(second.trace.builder.descriptionClaims, 1);
  assert.equal(second.trace.builder.judgeSupported, 2);
  assert.equal(second.trace.builder.judgeUnsupported, 0);
});

test('zero-hit operator fills retry across calls, then back off in the ledger without a version bump', async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, pages: [], fields: {}, attempts: [] });
  let gathers = 0;
  const options = {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, storeImpl, skipExisting: true, operatorFill: true,
    gatherImpl: async () => { gathers += 1; return { pages: [], attempts: [{ kind: 'brave', step: 'web_search', status: 'ok', results: 0, query: target.title }] }; },
    fetchImpl: async () => webResponse(), buildImpl: async () => assert.fail('no evidence'),
  };
  for (let count = 1; count <= 3; count += 1) {
    const row = (await runThingEvidenceDossierStagingTargets([{ ...target, website: undefined }], options)).results[0];
    assert.equal(row.emptySource, 'brave_zero_hits');
    assert.equal(gathers, count);
  }
  const backedOff = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
  assert.equal(gathers, 3);
  assert.equal(backedOff.trace.gather.gate, 'empty_gather_backoff');
  assert.deepEqual(backedOff.trace.attempts, []);
  const saved = await storeImpl.getDossier(key);
  const retry = saved.attempts.findLast((attempt) => attempt.step === 'operator_empty_gather_retry');
  assert.equal(retry.retryCount, 3);
  assert.ok(Date.parse(retry.nextEligibleAt) > Date.now());
  retry.nextEligibleAt = '2020-01-01T00:00:00Z';
  await storeImpl.putDossier(key, saved);
  await runThingEvidenceDossierStagingTargets([target], options);
  assert.equal(gathers, 4);
});

test('trace is absent outside operator fills and contains only bounded sanitized attempt metadata', async () => {
  const trace = createDossierFillTrace();
  recordDossierTraceAttempts(trace, [{ kind: 'brave', step: 'web_search', query: 'https://user:fixture-password@site.example/path?token=fixture-value Bearer fixture-bearer '+ 'word '.repeat(60), status: 'ok', results: 1 }]);
  const encoded = JSON.stringify(trace);
  assert.ok(!/fixture-password|fixture-value|fixture-bearer/.test(encoded));
  assert.ok(trace.attempts[0].query.length <= 120);
  const result = await runThingEvidenceDossierStagingTargets([target], {
    env: {}, storeImpl: memoryStore(), gatherImpl: async () => ({ thing: target.title, pages: [page()], attempts: [{ kind: 'page', status: 'ok' }] }),
    buildImpl: async () => ({ findings: findings() }), judgeImpl: judge, extractReviewsImpl: async () => ({ reviews: [] }),
    fetchImpl: async () => assert.fail('no provider'),
  });
  assert.equal('trace' in result.results[0], false);
});

test('a recovered HTTP retry followed by zero hits reports the terminal zero-hit reason', async () => {
  const { dossierEmptyGatherReason } = await import('../src/vacation/xai-dossier-fill-state.mjs');
  let calls = 0;
  const gathered = await runBraveQueries([target.title], {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: noSleep,
    fetchImpl: async () => { calls += 1; return webResponse([], calls === 1 ? 429 : 200); },
  });
  assert.equal(calls, 2);
  assert.equal(dossierEmptyGatherReason(gathered), 'brave_zero_hits');
});
