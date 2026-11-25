import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { gatherThingEvidence, dossierPagesVerified, dossierDeadlineFetch } from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierEmptyGatherReason } from '../src/vacation/xai-dossier-fill-state.mjs';
import { runDossierWebQueries } from '../src/vacation/dossier-web-search.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

const place = { title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };

async function gather({ hits = true, status = 432, extractMessage = '' } = {}) {
  const queries = [];
  const dossier = await gatherThingEvidence(place, {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { throw new Error(extractMessage || `Tavily extract failed with HTTP ${status}.`); },
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname !== '/search') return { ok: false, status: 403 };
      const query = JSON.parse(String(init.body || '{}')).query;
      queries.push(query);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: hits && query.startsWith('site:harbor.example') ? [
            { url: place.website, title: place.title, content: 'Harbor Bistro serves grilled fish and seasonal vegetables in its waterfront dining room. The lunch menu includes a daily fish dish.' },
            { url: 'https://harbor.example/menu', title: 'Harbor Bistro menu', content: 'Grilled fish, seasonal vegetables and lunch dishes.' },
          ] : [],
        }),
      };
    },
  });
  return { dossier, queries };
}

for (const status of [400, 401, 403, 429, 432]) test(`direct failure and Tavily ${status} keep dated web search pages and ledger`, async () => {
  const { dossier, queries } = await gather({ status });
  assert.ok(queries.includes('site:harbor.example'));
  assert.equal(dossier.pages.length, 2);
  assert.ok(dossier.pages.every((p) => p.via === 'tavily-search'));
  assert.ok(dossier.pages[0].text.includes('daily fish dish'));
  assert.equal(dossierPagesVerified(dossier), true);
  assert.ok(dossier.attempts.some((a) => a.provider === 'Tavily' && a.status === 'failed' && a.httpStatus === status));
  assert.ok(dossier.attempts.some((a) => a.provider === 'Tavily' && a.stage === 'extract_fallback' && a.status === 'ok' && a.query && a.url && a.startedAt));
});

test('Tavily 432 with zero web hits ends in a hard named reason', async () => {
  const { dossier } = await gather({ hits: false });
  assert.equal(dossier.pages.length, 0);
  assert.equal(dossierEmptyGatherReason(dossier), 'tavily_http_432');
});

test('long web snippets hash the exact saved bytes', async () => {
  const out = await runDossierWebQueries(['site:harbor.example'], {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ results: [{ url: place.website, title: place.title, content: 'Fish and vegetables. '.repeat(1200) }] }) }),
  });
  assert.equal(out.pages[0].text.length, 12000);
  assert.equal(out.pages[0].sha256, createHash('sha256').update(out.pages[0].text).digest('hex'));
});

test('Tavily plan limit without an HTTP status still saves web evidence', async () => {
  const { dossier } = await gather({ extractMessage: 'Tavily usage limit: plan exhausted' });
  assert.equal(dossier.pages.length, 2);
  assert.equal(dossierPagesVerified(dossier), true);
  assert.ok(dossier.attempts.some((a) => /usage limit/.test(a.error || '')));
});

test('an unindexed official path falls back to indexed pages on the official host', async () => {
  const queries = [];
  const dossier = await gatherThingEvidence({ ...place, website: `${place.website}unindexed-booking/path` }, {
    env: { TAVILI_API_KEY: 'offline-fixture' },
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { throw new Error('Tavily extract failed with HTTP 432.'); },
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname !== '/search') return { ok: false, status: 403 };
      const query = JSON.parse(String(init.body || '{}')).query;
      queries.push(query);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: query === 'site:harbor.example' ? [{
            url: `${place.website}menu`, title: place.title,
            content: 'Harbor Bistro serves grilled fish with seasonal vegetables and a daily lunch dish.',
          }, { url: 'https://unrelated.example/', title: 'Other Restaurant', content: 'Unrelated food.' }] : [],
        }),
      };
    },
  });
  assert.ok(queries.includes('site:harbor.example/unindexed-booking/path'));
  assert.ok(queries.includes('site:harbor.example'));
  assert.deepEqual(dossier.pages.map((page) => page.url), [`${place.website}menu`]);
  assert.equal(dossierPagesVerified(dossier), true);
});

test('gather checkpoints evidence and stops when the row deadline expires', async () => {
  let saved, searches = 0;
  const result = await fetchXaiPlaceRatings(place, {
    env: { TAVILI_API_KEY: 'offline-fixture' }, dossierKey: 'deadline:restaurant', timeBudgetMs: 30,
    storeImpl: {
      getDossier: async () => saved ? structuredClone(saved) : null,
      putDossier: async (_key, dossier) => { saved = structuredClone(dossier); },
    },
    buildImpl: async () => assert.fail('builder must wait for the next bounded request'),
    fetchImpl: async () => {
      searches += 1;
      await new Promise((r) => setTimeout(r, 35));
      return { ok: true, status: 200, json: async () => ({ results: [{
        url: place.website, title: place.title,
        content: 'Harbor Bistro serves grilled fish with seasonal vegetables and a daily lunch dish.',
      }] }) };
    },
  });
  assert.equal(searches, 1);
  assert.equal(result.partial, true);
  assert.equal(saved.captureCheckpoint, 'after_gather');
  assert.equal(dossierPagesVerified(saved), true);
  assert.equal(saved.pages.length, 1);
});

test('a request already in flight is aborted at the dossier deadline', async () => {
  const fetch = dossierDeadlineFetch(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }), Date.now() + 20);
  const timer = setTimeout(() => assert.fail('the dossier deadline must abort this request'), 500);
  try { await assert.rejects(fetch('https://harbor.example/'), { name: 'TimeoutError' }); }
  finally { clearTimeout(timer); }
});
