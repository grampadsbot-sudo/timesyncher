import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { buildPassBOperatorDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { gatherThingEvidence, mergeDossierForPersistence, dossierPagesVerified } from '../src/vacation/thing-evidence-dossier.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';

const page = (url, text) => ({ url, text, fetchedAt: '2026-10-27T05:00:00Z', sha256: createHash('sha256').update(text).digest('hex') });
const field = (value) => ({ value, claims: [{ text: value, pages: ['p1'] }] });
const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables.';

for (const extract of ['432', 'empty']) for (const hits of [true, false]) for (const previous of [2, 3]) test(`operator offset/limit/skipExisting restaurant recovery ${extract}, hits=${hits}, previous=${previous}`, async () => {
  const offset = buildPassBOperatorDossierTargets().findIndex((target) => target.category === 'restaurant');
  const { targets, batch } = await resolvePassBOperatorTargets({ offset, limit: 1, skipExisting: true }, { authMode: 'operator' });
  const target = targets[0];
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  const rowSummary = summary.replaceAll('Harbor Bistro', target.title);
  const rowDescription = description.replaceAll('Harbor Bistro', target.title);
  const storeImpl = memoryStore();
  storeImpl.rows.set(key, { thing: target.title, pages: [], fields: {}, emptySource: 'brave_extract_fallback_no_pages', attempts: [{ kind: 'gather', step: 'operator_empty_gather_retry', gatherVersion: previous, status: 'failed' }] });
  let gathers = 0;
  assert.equal(batch.offset, offset);
  assert.equal(targets.length, 1);
  const run = () => runThingEvidenceDossierStagingTargets(targets, {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    fetchImpl: async () => assert.fail('no unmocked fetch'),
    gatherImpl: async (place, options) => {
      gathers += 1;
      return gatherThingEvidence(place, { ...options, env: { BRAVE_SEARCH_API_KEY: 'offline-fixture', VK_SEARCH_BOT_PRIMARY: '0' }, sleepImpl: async () => {}, braveImpl: null,
        resolveImpl: async () => [{ address: '93.184.216.34' }],
        extractImpl: async () => { if (extract === '432') throw new Error('Tavily extract failed with HTTP 432.'); return []; },
        fetchImpl: async (url) => {
          const parsed = new URL(url);
          if (!parsed.pathname.endsWith('/web/search')) return { ok: false, status: 403 };
          const q = parsed.searchParams.get('q');
          return { ok: true, json: async () => ({ web: { results: hits && q === target.title ? [
            { url: 'https://guide.example/harbor', title: target.title, description: `${rowSummary} ${rowDescription}` },
          ] : [] } }) };
        },
      });
    },
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async () => ({ findings: { summary: field(rowSummary), description: field(rowDescription) } }),
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true })),
  });
  const result = (await run()).results[0];
  assert.equal(gathers, 1);
  const saved = await storeImpl.getDossier(result.dossierKey);
  assert.equal(result.failed, !hits);
  if (hits) {
    assert.equal(dossierPagesVerified(saved), true);
    assert.equal(dossierPresented(saved, target), true);
    assert.equal(saved.pages[0].via, 'brave-snippet');
  } else assert.equal(result.error, extract === '432' ? 'tavily_http_432' : 'brave_missing_key');
  await run();
  assert.equal(gathers, hits ? 1 : 2, 'next call retries empty evidence and reuses a successful recovery');
});

test('operator response counts cumulative stored pages after identity normalization, without losing dated versions', async () => {
  const target = { tripId: 'fixture-trip', placeId: 'fixture-cumulative', title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };
  const key = 'trip:fixture-trip:place:fixture-cumulative';
  const pages = [page(target.website, `${summary} ${description}`), page('https://other.example/1', 'Other Grill Restaurant serves noodles.'), page('https://other.example/2', 'Another Grill Restaurant serves noodles.')];
  const storeImpl = memoryStore();
  const put = storeImpl.putDossier;
  storeImpl.putDossier = async (key, value) => put(key, mergeDossierForPersistence(await storeImpl.getDossier(key) || {}, value));
  storeImpl.rows.set(key, { thing: target.title, pages, fields: {}, attempts: [{ kind: 'page', status: 'ok' }] });
  const result = (await runThingEvidenceDossierStagingTargets([target], {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    fetchImpl: async () => assert.fail('no search'), gatherImpl: async () => assert.fail('saved page exists'),
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (dossier) => {
      assert.equal(dossier.pages.length, 1, 'unrelated venues remain excluded from generation');
      return { findings: { summary: field(summary), description: field(description) } };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true })),
  })).results[0];
  const saved = await storeImpl.getDossier(key);
  assert.deepEqual(saved.pages, pages);
  assert.equal(result.pageCount, 3);
  assert.equal(result.pagesAdded, 0);
  assert.equal(result.failed, false);
});
