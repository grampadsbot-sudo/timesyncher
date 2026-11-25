import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runDossierWebQueries } from '../src/vacation/dossier-web-search.mjs';
import { dossierTavilySearch } from '../src/vacation/dossier-tavily-search.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { buildPassBOperatorDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { createDossierFillTrace, recordDossierTraceAttempts } from '../src/vacation/dossier-fill-trace.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { target, summary, description, page, field, findings, judge } from './lib/dossier-round4-test-support.mjs';

function tavilyResponse(rows = [], status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ results: rows }) };
}

for (const status of [401, 402, 422, 429, 500, 503]) test(`Tavily HTTP ${status} is named in attempts`, async () => {
  let calls = 0;
  const out = await dossierTavilySearch('Harbor Bistro Boston', {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    fetchImpl: async () => { calls += 1; return tavilyResponse([], status); },
  });
  assert.equal(calls, 1);
  assert.equal(out.attempts.at(-1).httpStatus, status);
  assert.equal(out.attempts.at(-1).error, `tavily_http_${status}`);
});

test('Tavily multi-query run preserves stage labels and collects pages', async () => {
  let calls = 0;
  const out = await runDossierWebQueries([{ query: 'Harbor Bistro route', stage: 'general' }, 'Harbor Bistro menu'], {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    fetchImpl: async () => {
      calls += 1;
      return tavilyResponse(calls === 1 ? [] : [{
        url: target.website, title: target.title, content: summary,
      }], calls === 1 ? 429 : 200);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(out.attempts.map((row) => row.httpStatus), [429, 200]);
  assert.equal(out.attempts[0].searchStage, 'general');
  assert.equal(out.pages.length, 1);
});

test('operator R0 retries current-version exhaustion on the next offset/limit/skipExisting call and traces only that call', async () => {
  const offset = buildPassBOperatorDossierTargets().findIndex((row) => row.category === 'restaurant');
  const { targets, batch } = await resolvePassBOperatorTargets({ offset, limit: 1, skipExisting: true }, { authMode: 'operator' });
  assert.equal(batch.offset, offset);
  assert.equal(targets.length, 1);
  const row = targets[0];
  const storeImpl = memoryStore();
  storeImpl.rows.set(`trip:${row.tripId}:place:${row.placeId}`, {
    thing: row.title, pages: [], fields: {}, emptySource: 'web_extract_fallback_no_pages', attempts: [
      { kind: 'page', stage: 'extract_fallback', status: 'failed', error: 'web_extract_fallback_no_pages', query: 'old-query' },
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
      return gatherThingEvidence(place, {
        ...opts,
        env: { TAVILI_API_KEY: 'offline-fixture', VK_SEARCH_BOT_PRIMARY: '0' },
        resolveImpl: async () => [{ address: '93.184.216.34' }],
        extractImpl: async () => { throw new Error('Tavily extract failed with HTTP 432.'); },
        fetchImpl: async (url, init = {}) => {
          const parsed = new URL(url);
          if (parsed.pathname !== '/search') return tavilyResponse([], 403);
          const q = JSON.parse(String(init.body || '{}')).query;
          queries.push(q);
          return tavilyResponse(gathers > 1 && q === row.title ? [{ url: 'https://guide.example/restaurant',
            title: row.title, content: `${summary} ${description}`.replaceAll(target.title, row.title) }] : [], gathers === 1 ? 401 : 200);
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
  assert.equal(first.emptySource, 'tavily_http_401');
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
    env: { TAVILI_API_KEY: 'offline-fixture' }, storeImpl, skipExisting: true, operatorFill: true,
    gatherImpl: async () => { gathers += 1; return { pages: [], attempts: [{ kind: 'page', provider: 'Tavily', stage: 'search', step: 'web_search', status: 'ok', results: 0, query: target.title }] }; },
    fetchImpl: async () => tavilyResponse(), buildImpl: async () => assert.fail('no evidence'),
  };
  for (let count = 1; count <= 3; count += 1) {
    const row = (await runThingEvidenceDossierStagingTargets([{ ...target, website: undefined }], options)).results[0];
    assert.equal(row.emptySource, 'tavily_zero_hits');
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
  recordDossierTraceAttempts(trace, [{ kind: 'page', provider: 'Tavily', step: 'web_search', query: 'https://user:fixture-password@site.example/path?token=fixture-value Bearer fixture-bearer ' + 'word '.repeat(60), status: 'ok', results: 1 }]);
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

test('zero hits reports the terminal tavily_zero_hits reason', async () => {
  const { dossierEmptyGatherReason } = await import('../src/vacation/xai-dossier-fill-state.mjs');
  const gathered = await runDossierWebQueries([target.title], {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    fetchImpl: async () => tavilyResponse([], 200),
  });
  assert.equal(dossierEmptyGatherReason(gathered), 'tavily_zero_hits');
});
