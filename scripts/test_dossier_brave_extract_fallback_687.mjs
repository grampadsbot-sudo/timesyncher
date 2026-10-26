import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { gatherThingEvidence, dossierPagesVerified } from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierEmptyGatherReason } from '../src/vacation/xai-dossier-fill-state.mjs';
import { runBraveQueries } from '../src/vacation/dossier-brave.mjs';

const place = { title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };

async function gather({ hits = true, status = 432, extractMessage = '' } = {}) {
  const queries = [];
  const dossier = await gatherThingEvidence(place, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' },
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
  assert.equal(dossierEmptyGatherReason(dossier), 'brave_extract_fallback_no_pages');
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
