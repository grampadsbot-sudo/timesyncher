import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatherThingEvidence, dossierPagesVerified } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { tripPlaceDossierKey, saveThingEvidenceDossier, loadThingEvidenceDossier } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { dossierFillHardFailure } from '../src/vacation/xai-dossier-fill-state.mjs';

const place = { title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };

for (const extract of ['432', 'empty']) test(`${extract} extract retains target-named third-party Brave evidence`, async () => {
  const dossier = await gather(extract, true);
  assert.equal(dossier.pages.length, 1);
  assert.equal(dossierPagesVerified(dossier), true);
  assert.equal(dossier.pages[0].via, 'brave-snippet');
  assert.equal(dossier.pages[0].url, 'https://guide.example/harbor');
  assert.match(dossier.pages[0].text, /Harbor Bistro[\s\S]*grilled fish[\s\S]*seasonal vegetables/);
  assert.ok(dossier.attempts.some((row) => row.stage === 'extract_fallback' && row.status === 'ok' && row.pages === 1));
});

test('zero hits produces a hard named terminal reason', async () => {
  const dossier = await gather('empty', false);
  assert.equal(dossier.pages.length, 0);
  assert.deepEqual(dossierFillHardFailure(dossier, place), {
    failed: true, status: 'failed', error: 'brave_extract_fallback_no_pages', emptySource: 'brave_extract_fallback_no_pages',
  });
});

async function gather(extract, hits) {
  return gatherThingEvidence(place, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, braveImpl: null,
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => {
      if (extract === '432') throw new Error('Tavily extract failed with HTTP 432.');
      return [];
    },
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith('/web/search')) return { ok: false, status: 403 };
      const query = parsed.searchParams.get('q');
      return { ok: true, json: async () => ({ web: { results: hits && query === 'site:harbor.example' ? [
        { url: 'https://guide.example/harbor', title: 'Harbor Bistro guide', description: 'Harbor Bistro serves grilled fish beside the waterfront.', extra_snippets: ['The lunch plates include seasonal vegetables.'] },
        { url: 'https://unrelated.example/', title: 'Other Bistro', description: 'An unrelated restaurant serves noodles.' },
      ] : [] } }) };
    },
  });
}

test('old empty-gather exhaustion gets one revised recovery and keeps a hard zero-hit result', async () => {
  const target = { ...place, tripId: 'fixture-trip', placeId: 'fixture-gather' };
  const key = tripPlaceDossierKey(target.tripId, target.placeId);
  const storeImpl = memoryStore();
  await saveThingEvidenceDossier(key, {
    thing: place.title, pages: [], fields: {},
    emptySource: 'brave_extract_fallback_no_pages',
    attempts: [{ kind: 'gather', step: 'operator_empty_gather_retry', gatherVersion: 2, status: 'failed' }],
  }, { env: {}, storeImpl });
  let gathers = 0;
  const run = () => runThingEvidenceDossierStagingTargets([target], {
    env: {}, operatorFill: true, storeImpl,
    fetchImpl: async () => assert.fail('no network outside offline gather fixture'),
    gatherImpl: async () => { gathers += 1; return gather('empty', false); },
    buildImpl: async () => assert.fail('no text without pages'),
  });
  const result = (await run()).results[0];
  assert.equal(gathers, 1);
  assert.equal(result.failed, true);
  assert.equal(result.error, 'brave_extract_fallback_no_pages');
  assert.ok((await loadThingEvidenceDossier(key, { env: {}, storeImpl })).attempts.some((row) => row.gatherVersion === 3 && row.status === 'failed'));
  await run();
  assert.equal(gathers, 1, 'unchanged zero-hit evidence cannot restart recovery');
});
