import assert from 'node:assert/strict';
import { gatherThingEvidence, dossierPagesVerified, mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import { claimsSupported, applyDossierFields } from '../src/vacation/thing-dossier-fields.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { runDossierFetchTask } from '../src/vacation/dossier-fetch-process.mjs';
import { buildNycThingEvidenceDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import {
  gatherVkSearchEvidence, isThinVkSearchResult, vkSearchClaimSupportOk,
  loadVkSearchCensusResult, vkSearchResultToDossier, VK_SEARCH_BOT_ID,
} from '../src/vacation/dossier-vk-search.mjs';

const place = { id: 602, title: "Zabar's", category: 'store', website: 'https://www.zabars.com/directions.html' };
const result = loadVkSearchCensusResult(place, { env: {} });
assert.equal(result.thingName, place.title);
assert.equal(vkSearchClaimSupportOk(result), true);
assert.equal(isThinVkSearchResult({}), true);
assert.equal(isThinVkSearchResult({ rating: { primary: 4 } }), false);
assert.equal(isThinVkSearchResult({ summaryClaims: [{ claim: 'A claim' }] }), false);
assert.equal(isThinVkSearchResult({ sources: [{ url: 'javascript:bad' }] }), true);
let braveCalls = 0;
const options = {
  env: {}, vkSearchImpl: async () => result,
  fetchImpl: async () => { throw new Error('rich bot must not call web providers'); },
  braveImpl: async () => { braveCalls += 1; return { pages: [], attempts: [] }; },
};
const rich = await gatherThingEvidence(place, options);
assert.equal(braveCalls, 0);
assert.equal(rich.pages.every((page) => page.via === 'vk-search'), true);
assert.equal(rich.attempts.some((row) => ['vk-search', 'grok-bot'].includes(row.provider)), true);
assert.equal(rich.attempts[0].botId, VK_SEARCH_BOT_ID);
assert.equal(dossierPagesVerified(rich), true);
assert.equal(rich.yelpRating, 3.9);
assert.equal(rich.yelpReviewCount, 1448);
assert.ok(rich.fields.hours);
assert.ok(rich.fields.itineraryNote);
for (const field of Object.values(rich.fields)) {
  assert.equal(claimsSupported(rich, field), true);
  for (const claim of field.claims) {
    assert.ok(result.sources.some((source) => source.url === claim.sourceUrl));
    assert.ok(rich.pages[Number(claim.pages[0].slice(1)) - 1].text.includes(claim.text));
  }
}
const normalized = normalizeDossierEvidence(rich, place);
const displayed = applyDossierFields(place, normalized);
assert.equal(String(displayed.yelpRating), '3.9');
assert.equal(displayed.hours, rich.fields.hours.value);
assert.equal(displayed.itineraryNote, result.itineraryNoteCandidate);
assert.equal(displayed.price, undefined, 'text price hint is not a numeric price');
assert.equal(displayed.thirdPartyRating, '3.9');
assert.equal(displayed.thirdPartyReviewCount, '1448');
const persisted = mergeDossierForPersistence({ pages: [{ ...rich.pages[0], url: 'https://old.test/' }] }, rich);
for (const field of Object.values(persisted.fields)) {
  for (const claim of field.claims) {
    assert.equal(persisted.pages[Number(claim.pages[0].slice(1)) - 1].url, claim.sourceUrl,
      'all scalar citations follow their pages when merging into an existing ledger');
  }
}
const child = await runDossierFetchTask('gather', place, { env: {}, deadline: Date.now() + 5000 });
assert.equal(child.yelpRating, 3.9, 'census works through the real fetch worker');
const childMissing = await runDossierFetchTask('gather', { ...place, website: '' }, {
  env: { VK_SEARCH_CENSUS_DIR: '/missing' }, deadline: Date.now() + 5000,
});
assert.equal(childMissing.yelpRating, undefined, 'worker respects census directory override');
assert.ok(childMissing.attempts.some((row) => row.status === 'fallback_brave'));

const thin = await gatherThingEvidence({ ...place, website: '' }, { ...options, vkSearchImpl: async () => ({ sources: [] }) });
assert.equal(braveCalls, 1);
assert.ok(thin.attempts.some((row) => row.status === 'fallback_brave' && row.reason === 'thin'));
const failedSupport = await gatherThingEvidence(place, {
  ...options, vkSearchImpl: async () => ({ ...result, voicePass: { claimSupportOk: false } }),
});
assert.equal(braveCalls, 1);
assert.ok(failedSupport.pages.length);
assert.equal(failedSupport.itineraryNote, undefined);
assert.equal(failedSupport.fields.itineraryNote, undefined);
assert.equal(failedSupport.attempts[0].status, 'claim_support_failed');
const invalid = vkSearchResultToDossier({ ...result, summaryClaims: [
  ...result.summaryClaims, { claim: 'Invented assertion', sourceUrl: 'https://absent.test/' },
] }, place);
assert.equal(invalid.fields.itineraryNote, undefined);
assert.equal(invalid.fields.summary.value.includes('Invented assertion'), false);
assert.equal(invalid.pages.some((page) => page.text.includes('Invented assertion')), false);
const uncited = vkSearchResultToDossier({ ...result, sources: [] }, place);
assert.deepEqual(uncited.fields, {});
assert.equal(uncited.yelpRating, undefined);
assert.equal(loadVkSearchCensusResult({ id: '../602' }, { env: {} }), null);
assert.equal(loadVkSearchCensusResult({ id: 602 }, { env: { VK_SEARCH_CENSUS_DIR: '/missing' } }), null);
assert.equal((await gatherVkSearchEvidence(place, { env: {} })).yelpRating, 3.9);
let wakeCalls = 0;
const wake = await gatherVkSearchEvidence(place, {
  env: { VK_SEARCH_WAKE_URL: 'https://bot.test/wake' },
  fetchImpl: async (url, options) => {
    wakeCalls += 1;
    assert.equal(url, 'https://bot.test/wake');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { botId: VK_SEARCH_BOT_ID, place });
    return { ok: true, json: async () => result };
  },
});
assert.equal(wakeCalls, 1);
assert.equal(wake.yelpRating, 3.9);
const unavailable = await gatherVkSearchEvidence(place, { vkSearchImpl: async () => { throw new Error('unavailable'); } });
assert.equal(unavailable.pages.length, 0);
assert.equal(unavailable.attempts[0].error, 'unavailable');
const disabled = await gatherThingEvidence({ ...place, website: '' }, {
  ...options, env: { VK_SEARCH_BOT_PRIMARY: '0' }, vkSearchImpl: async () => { throw new Error('disabled'); },
});
assert.equal(braveCalls, 2);
assert.equal(disabled.attempts.some((row) => row.kind === 'vk-search'), false);
let censusChecked = 0;
for (const target of buildNycThingEvidenceDossierTargets()) {
  const census = loadVkSearchCensusResult(target, { env: {} });
  if (!census) continue;
  const dossier = vkSearchResultToDossier(census, target);
  assert.equal(dossierPagesVerified(dossier), true);
  for (const field of Object.values(dossier.fields)) {
    for (const claim of field.claims) {
      const cited = dossier.pages[Number(claim.pages[0].slice(1)) - 1];
      assert.equal(cited.url, claim.sourceUrl);
      assert.ok(census.sources.some((source) => source.url === claim.sourceUrl));
      assert.ok(cited.text.includes(claim.text));
    }
  }
  const shown = applyDossierFields(target, normalizeDossierEvidence(dossier, target));
  assert.notEqual(Number.isNaN(shown.price), true);
  if (!vkSearchClaimSupportOk(census)) assert.equal(dossier.itineraryNote, undefined);
  censusChecked += 1;
}
assert.equal(censusChecked, 76);
console.log(JSON.stringify({ ok: true, checked: 'dossier-vk-search-adapter', fixture: 602 }));
