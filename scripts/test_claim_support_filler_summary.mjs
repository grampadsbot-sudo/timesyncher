import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier, loadVkSearchCensusResult } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields, recitBotPrimaryFields, runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { isFillerSummaryText } from '../src/vacation/dossier-claim-support.mjs';

const thing = 'Hilton Club New York';
const url = 'https://hotel.example/official';
const place = { title: thing, category: 'hotel' };
const fillers = ['Official site ' + url, 'Official website', url, `${thing}: ${url}`, `${thing}: Official site ${url}`, `${thing} ${url}`];
for (const body of fillers) {
  test(`filler is not a supported summary: ${body}`, () => {
    const page = { url, fetchedAt: '2026-10-28T12:00:00Z', text: body };
    const claims = [{ text: body, sourceUrl: url, pages: ['p1'], supported: true }];
    const raw = { thing, pages: [page], fields: { summary: { value: `${thing}: ${body}`, claims }, description: { value: `${thing}: ${body}`, claims } }, attempts: [{ provider: 'vk-search', status: 'ok' }] };
    const adapter = vkSearchResultToDossier({ sources: [page], voicePass: { claimSupportOk: true }, summaryClaims: [{ claim: body, sourceUrl: url, supported: true }] }, place);
    for (const dossier of [adapter, recitBotPrimaryFields(raw), mergeBotPrimaryPresentedFields({}, raw, place)]) {
      assert.ok(!dossier.fields.summary?.value);
      assert.ok(!dossier.fields.description?.value);
      assert.equal(dossierPresented(dossier, place), false);
    }
  });
}
test('long subject label plus URL cannot satisfy summary or description minimum', () => {
  const title = 'The Grand Historic Hilton Club New York Hotel Suites Beside The Central Midtown Public Garden';
  const body = `${title}: Official site ${url}`;
  const dossier = vkSearchResultToDossier({ sources: [{ url, text: body, fetchedAt: '2026-10-28T12:00:00Z' }], voicePass: { claimSupportOk: true }, summaryClaims: [{ claim: body, sourceUrl: url, supported: true }] }, { title, category: 'hotel' });
  assert.ok(!dossier.fields.summary?.value);
  assert.ok(!mergeBotPrimaryPresentedFields({}, dossier, { title }).fields.summary?.value);
});
test('real sourced prose remains usable alongside filler claims', () => {
  const body = 'Guests enjoy a rooftop pool and free breakfast daily beside the sunny garden terrace.';
  const dossier = vkSearchResultToDossier({
    sources: [{ url, text: body, fetchedAt: '2026-10-28T12:00:00Z' }],
    voicePass: { claimSupportOk: true },
    summaryClaims: [{ claim: 'Official website', sourceUrl: url, supported: true }, { claim: body, sourceUrl: url, supported: true }],
    fields: { summary: { value: body, claims: [{ text: body, sourceUrl: url, supported: true }] } },
  }, place);
  assert.ok(dossier.fields.summary?.value.includes(body));
  assert.equal(dossier.fields.summary.claims.some((claim) => /Official website/i.test(claim.text)), false);
});
test('offline seed clears synthetic filler summary without census fixture', async () => {
  const fillerBody = `${thing}: Official site ${url}`;
  const syntheticPage = { url, fetchedAt: '2026-10-28T12:00:00Z', text: fillerBody };
  const syntheticBot = vkSearchResultToDossier({
    thingName: thing,
    sources: [syntheticPage],
    voicePass: { claimSupportOk: true },
    summaryClaims: [{ claim: fillerBody, sourceUrl: url, supported: true }],
    fields: {
      summary: {
        value: fillerBody,
        claims: [{ text: fillerBody, sourceUrl: url, supported: true }],
      },
      description: {
        value: fillerBody,
        claims: [{ text: fillerBody, sourceUrl: url, supported: true }],
      },
    },
  }, place);
  const mem = new Map();
  const storeImpl = {
    async getDossier(key) { return mem.get(key) || null; },
    async putDossier(key, value) { mem.set(key, structuredClone(value)); },
  };
  const result = await runBotPrimarySeedTargets([{
    placeId: 'synthetic-hilton-filler-618',
    title: thing,
    category: 'hotel',
    dossierKey: 'r4-hilton-filler',
  }], {
    env: { VK_SEARCH_CENSUS_DIR: '/tmp/vk728-empty-census-for-filler-test' },
    storeImpl,
    gatherImpl: async () => syntheticBot,
  });
  const dossier = mem.get('r4-hilton-filler');
  assert.ok(!dossier.fields.summary?.value);
  assert.ok(!dossier.fields.description?.value);
  assert.equal(dossierPresented(dossier, place), false);
  assert.equal(result.results[0].presented, false);
  assert.equal(Object.values(dossier.fields).flatMap((field) => field?.claims || []).some((claim) => claim.supported === true && /^Official site/i.test(claim.text)), false);
});
test('census Hilton 618 summary is genuine prose, not filler', async () => {
  const census = loadVkSearchCensusResult({ id: 618 }, { env: {} });
  assert.equal(census.thingName, thing);
  const censusSummary = String(census.fields?.summary?.value || '').trim();
  assert.ok(censusSummary);
  assert.equal(isFillerSummaryText(censusSummary, thing), false);
  const recit = recitBotPrimaryFields(vkSearchResultToDossier(census, place));
  assert.ok(recit.fields.summary?.value.includes('Midtown'));
  const mem = new Map();
  const storeImpl = {
    async getDossier(key) { return mem.get(key) || null; },
    async putDossier(key, value) { mem.set(key, structuredClone(value)); },
  };
  const result = await runBotPrimarySeedTargets([{
    placeId: 618,
    title: thing,
    category: 'hotel',
    dossierKey: 'r4-hilton',
  }], {
    env: {},
    storeImpl,
    gatherImpl: async () => { throw new Error('unexpected gather'); },
  });
  const dossier = mem.get('r4-hilton');
  assert.ok(dossier.fields.summary?.value);
  assert.equal(isFillerSummaryText(dossier.fields.summary.value, thing), false);
  assert.equal(dossierPresented(dossier, place), true);
  assert.equal(result.results[0].presented, true);
});
test('genuine descriptive summary stays supported with an official site link', () => {
  const body = `Guests enjoy a rooftop pool and free breakfast daily beside the sunny garden terrace. Official site ${url}`;
  const summaryText = 'Guests enjoy a rooftop pool and free breakfast daily beside the sunny garden terrace.';
  const dossier = vkSearchResultToDossier({
    sources: [{ url, text: body, fetchedAt: '2026-10-28T12:00:00Z' }],
    voicePass: { claimSupportOk: true },
    summaryClaims: [{ claim: body, sourceUrl: url, supported: true }],
    fields: { summary: { value: summaryText, claims: [{ text: summaryText, sourceUrl: url, supported: true }] } },
  }, place);
  for (const verified of [dossier, recitBotPrimaryFields(dossier), mergeBotPrimaryPresentedFields({}, dossier, place)]) {
    assert.ok(verified.fields.summary?.value.includes('Guests enjoy a rooftop pool'));
    assert.ok(verified.fields.summary.claims.some((claim) => claim.supported === true));
  }
});
test('short genuine source fragments compose into a usable whole summary', () => {
  const bodies = [
    'Garden terrace welcomes breakfast guests.',
    'Spacious rooms overlook peaceful courtyards.',
    'Friendly staff arrange museum visits.',
  ];
  const pages = bodies.map((text, index) => ({ url: `${url}/${index}`, fetchedAt: '2026-10-28T12:00:00Z', text }));
  const claims = bodies.map((text, index) => ({ text, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true }));
  const adapter = vkSearchResultToDossier({
    sources: pages,
    voicePass: { claimSupportOk: true },
    summaryClaims: claims.map((row) => ({ ...row, claim: row.text })),
    fields: { summary: { value: bodies.join(' '), claims } },
  }, place);
  for (const dossier of [adapter, recitBotPrimaryFields(adapter)]) {
    assert.ok(dossier.fields.summary?.value);
    assert.deepEqual(dossier.fields.summary.claims.map((row) => row.text), bodies);
    assert.ok(dossier.fields.summary.claims.every((row) => row.supported === true));
    assert.ok(!dossier.fields.description?.value);
  }
  const botWritten = {
    summary: { value: bodies.join(' '), claims },
    description: {
      value: `${bodies.join(' ')} ${bodies.join(' ')}`,
      claims: bodies.map((text, index) => ({ text, sourceUrl: pages[index].url, pages: [`p${index + 1}`], supported: true })),
    },
  };
  const merged = mergeBotPrimaryPresentedFields({}, { thing, pages, fields: botWritten }, place);
  assert.ok(merged.fields.summary?.value);
  assert.deepEqual(merged.fields.summary.claims.map((row) => row.text), bodies);
  assert.ok(merged.fields.description?.value);
});
test('whole stored filler value clears without downgrading short genuine claims', () => {
  const text = 'First supported claim.';
  const claims = [{ text, sourceUrl: url, pages: ['p1'], supported: true }];
  const dossier = recitBotPrimaryFields({ thing, pages: [{ url, fetchedAt: '2026-10-28T12:00:00Z', text }], fields: { summary: { value: `${thing}: Official site ${url}`, claims } } });
  assert.equal(dossier.fields.summary.value, '');
  assert.deepEqual(dossier.fields.summary.claims, claims);
});
