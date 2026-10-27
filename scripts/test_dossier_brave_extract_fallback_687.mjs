import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { gatherThingEvidence, dossierPagesVerified, dossierDeadlineFetch } from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierEmptyGatherReason } from '../src/vacation/xai-dossier-fill-state.mjs';
import { runBraveQueries } from '../src/vacation/dossier-brave.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

const place = { title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };

async function gather({ hits = true, status = 432, extractMessage = '' } = {}) {
  const queries = [];
  const dossier = await gatherThingEvidence(place, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: async () => {},
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { throw new Error(extractMessage || `Tavily extract failed with HTTP ${status}.`); },
    braveImpl: null,
    fetchImpl: async (url) => {
      if (!url.includes('/web/search?')) return { ok: false, status: 403 };
      const query = new URL(url).searchParams.get('q');
      queries.push(query);
      return { ok: true, json: async () => ({ web: { results: hits && query.startsWith('site:harbor.example') ? [
        { url: place.website, title: place.title, description: 'Harbor Bistro serves grilled fish and seasonal vegetables in its waterfront dining room.', extra_snippets: ['The lunch menu includes a daily fish dish.'] },
        { url: 'https://harbor.example/menu', title: 'Harbor Bistro menu', description: 'Grilled fish, seasonal vegetables and lunch dishes.' },
      ] : [] } }) };
    },
  });
  return { dossier, queries };
}

for (const status of [400, 401, 403, 429, 432]) test(`direct failure and Tavily ${status} keep dated Brave snippet pages and ledger`, async () => {
  const { dossier, queries } = await gather({ status });
  assert.ok(queries.includes('site:harbor.example'));
  assert.equal(dossier.pages.length, 2);
  assert.ok(dossier.pages.every((p) => p.via === 'brave-snippet'));
  assert.ok(dossier.pages[0].text.includes('daily fish dish'));
  assert.equal(dossierPagesVerified(dossier), true);
  assert.ok(dossier.attempts.some((a) => a.provider === 'Tavily' && a.status === 'failed' && a.httpStatus === status));
  assert.ok(dossier.attempts.some((a) => a.provider === 'Brave' && a.stage === 'extract_fallback' && a.status === 'ok' && a.query && a.url && a.startedAt));
});

test('Tavily 432 with zero Brave hits ends in a hard named reason', async () => {
  const { dossier } = await gather({ hits: false });
  assert.equal(dossier.pages.length, 0);
  assert.equal(dossierEmptyGatherReason(dossier), 'tavily_http_432');
});

test('long Brave snippets hash the exact saved bytes', async () => {
  const out = await runBraveQueries(['site:harbor.example'], {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ web: { results: [{ url: place.website, title: place.title, description: 'Fish and vegetables. '.repeat(1200) }] } }) }),
  });
  assert.equal(out.pages[0].text.length, 12000);
  assert.equal(out.pages[0].sha256, createHash('sha256').update(out.pages[0].text).digest('hex'));
});

test('Tavily plan limit without an HTTP status still saves Brave evidence', async () => {
  const { dossier } = await gather({ extractMessage: 'Tavily usage limit: plan exhausted' });
  assert.equal(dossier.pages.length, 2);
  assert.equal(dossierPagesVerified(dossier), true);
  assert.ok(dossier.attempts.some((a) => /usage limit/.test(a.error || '')));
});

test('an unindexed official path falls back to indexed pages on the official host', async () => {
  const queries = [];
  const dossier = await gatherThingEvidence({ ...place, website: `${place.website}unindexed-booking/path` }, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: async () => {}, braveImpl: null,
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { throw new Error('Tavily extract failed with HTTP 432.'); },
    fetchImpl: async (url) => {
      if (!url.includes('/web/search?')) return { ok: false, status: 403 };
      const query = new URL(url).searchParams.get('q');
      queries.push(query);
      return { ok: true, json: async () => ({ web: { results: query === 'site:harbor.example' ? [{
        url: `${place.website}menu`, title: place.title,
        description: 'Harbor Bistro serves grilled fish with seasonal vegetables and a daily lunch dish.',
      }, { url: 'https://unrelated.example/', title: 'Other Restaurant', description: 'Unrelated food.' }] : [] } }) };
    },
  });
  assert.ok(queries.includes('site:harbor.example/unindexed-booking/path'));
  assert.ok(queries.includes('site:harbor.example'));
  assert.deepEqual(dossier.pages.map((page) => page.url), [`${place.website}menu`]);
  assert.equal(dossierPagesVerified(dossier), true);
});

test('gather checkpoints evidence and stops when the next paced request cannot fit the row deadline', async () => {
  let saved, searches = 0;
  const result = await fetchXaiPlaceRatings(place, {
    sleepImpl: async () => {}, env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, dossierKey: 'deadline:restaurant', timeBudgetMs: 40,
    storeImpl: {
      getDossier: async () => saved ? structuredClone(saved) : null,
      putDossier: async (_key, dossier) => { saved = structuredClone(dossier); },
    },
    buildImpl: async () => assert.fail('builder must wait for the next bounded request'),
    fetchImpl: async (_url, options) => {
      searches += 1;
      if (searches === 1) return { ok: true, json: async () => ({ web: { results: [{
        url: place.website, title: place.title,
        description: 'Harbor Bistro serves grilled fish with seasonal vegetables and a daily lunch dish.',
      }] } }) };
      assert.fail('no second request fits the paced gather budget');
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
