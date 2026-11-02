import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';

const pageText = 'Garden House serves seasonal vegetables beside a quiet terrace with comfortable seating and shaded paths for visitors throughout the warmer months. Guests can enjoy lunch after exploring nearby galleries and shops before returning to the garden for a peaceful afternoon meal.';
for (const fetchedAt of [undefined, '', 'invalid']) {
  test(`adapter preserves ${String(fetchedAt)}`, () => {
    const dossier = vkSearchResultToDossier({ sources: [{ url: 'https://garden.test/info', text: pageText, fetchedAt }] }, { title: 'Garden House' });
    assert.equal(dossier.pages[0].fetchedAt, fetchedAt);
    assert.equal(Object.values(dossier.fields).flatMap((field) => field.claims || []).some((claim) => claim.supported === true), false);
  });
  test(`seed never dates ${String(fetchedAt)}`, async () => {
    const mem = new Map();
    const storeImpl = { async getDossier(key) { return mem.get(key) || null; }, async putDossier(key, value) { mem.set(key, structuredClone(value)); } };
    await runBotPrimarySeedTargets([{ placeId: 'r3-undated', title: 'Garden House', category: 'restaurant', dossierKey: 'r3-undated' }], { env: { VK_SEARCH_CENSUS_DIR: '/missing' }, storeImpl, gatherImpl: async () => ({ pages: [{ url: 'https://garden.test/info', text: pageText, fetchedAt }, { text: pageText, fetchedAt: '2026-10-28T00:00:00Z' }], fields: {} }) });
    const dossier = mem.get('r3-undated');
    assert.ok(dossier);
    assert.equal(dossier.pages.some((page) => Number.isFinite(Date.parse(page.fetchedAt))), false);
    assert.equal(dossier.pages.some((page) => String(page.url).includes('example.invalid')), false);
    assert.equal(Object.values(dossier.fields).flatMap((field) => field?.claims || []).some((claim) => claim.supported === true), false);
  });
}
