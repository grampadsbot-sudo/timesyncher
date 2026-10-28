import assert from 'node:assert/strict';
import test from 'node:test';
import * as claimSupport from '../src/vacation/dossier-claim-support.mjs';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields, recitBotPrimaryFields, runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';

const { claimTextSupportedByPage, claimTextWasRejected } = claimSupport;
const claim = 'This hotel has a rooftop pool and free breakfast.';
const denial = 'This hotel has no rooftop pool and does not offer free breakfast.';
const url = 'https://hotel.example/amenities';
const source = { url, fetchedAt: '2026-10-28T12:00:00Z', text: denial };
const place = { title: 'Example Hotel', category: 'hotel' };
const rows = (dossier) => Object.values(dossier.fields || {}).flatMap((field) => field?.claims || []);
const accepted = (dossier, value) => rows(dossier).some((row) => row.text === value && row.supported === true);
const positive = 'This hotel has a rooftop pool and free breakfast daily beside the sunny garden terrace.';
const resultFor = (overrides = {}) => ({ voicePass: { claimSupportOk: true }, sources: [{ ...source, text: positive }], summaryClaims: [{ claim: positive, sourceUrl: url, supported: true }], ...overrides });

test('GPT reviewer case 1: a negated saved page cannot support a positive claim', () => {
  assert.equal(claimTextSupportedByPage(claim, denial), false);
});
test('GPT reviewer case 2: upstream rejection cannot be upgraded by the adapter', () => {
  const dossier = vkSearchResultToDossier({ voicePass: { claimSupportOk: false }, sources: [source], summaryClaims: [{ claim, sourceUrl: url, supported: false }] }, place);
  assert.equal(accepted(dossier, claim), false);
});
test('paraphrase and literal positive controls', () => {
  assert.equal(claimTextSupportedByPage('Rooftop pool and free breakfast are offered.', 'Guests enjoy free breakfast daily and a rooftop pool.'), true);
  assert.equal(claimTextSupportedByPage(claim, `Amenities: ${claim} Guests enjoy the garden.`), true);
  assert.equal(claimTextSupportedByPage('This hotel has no rooftop pool.', 'This hotel has no rooftop pool.'), true);
  assert.equal(claimTextSupportedByPage('No rooftop pool is offered.', 'A rooftop pool is not offered.'), true);
});
test('every contradiction cue rejects both polarity directions', () => {
  for (const negative of [
    'No rooftop pool.', 'The rooftop pool is not offered.', 'The rooftop pool is never available.',
    'Guests stay without a rooftop pool.', 'Rooftop pool: none.', "The rooftop pool isn't available.",
    "The rooftop pool doesn't operate.", "Rooftop pools aren't available.", 'The rooftop pool cannot open.',
    'The rooftop pool is closed.', 'The rooftop pool is unavailable.', 'The rooftop pool is discontinued.',
    'The rooftop pool is no longer offered.', 'The rooftop pool isn’t available.',
  ]) {
    const positiveText = negative.includes('pools') ? 'Rooftop pools are available.' : 'A rooftop pool is available.';
    assert.equal(claimTextSupportedByPage(positiveText, negative), false, negative);
    assert.equal(claimTextSupportedByPage(negative, positiveText), false, negative);
  }
});
test('literal substring does not override nearby contradictory statements', () => {
  assert.equal(claimTextSupportedByPage(claim, `${claim} Update: this hotel has no rooftop pool or free breakfast.`), false);
  assert.equal(claimTextSupportedByPage('The rooftop pool is closed.', 'The rooftop pool is closed. The rooftop pool is available.'), false);
});
test('numeric and time controls preserve R3 equivalences and exact values', () => {
  for (const [a, b] of [['8am', '8'], ['7:30pm', '7:30'], ['8:00', '8']]) {
    assert.equal(claimTextSupportedByPage(`The cafe opens ${a}`, `The cafe opens ${b}`), true);
  }
  for (const [a, b] of [['$25', '$125'], ['5 pm', '6 pm'], ['7:30pm', '7:31']]) {
    assert.equal(claimTextSupportedByPage(`The cafe opens ${a}`, `The cafe opens ${b}`), false);
  }
});
test('voice true and supported true retain genuinely supported claims', () => {
  assert.equal(accepted(vkSearchResultToDossier(resultFor(), place), positive), true);
});
test('missing dates and unknown source identities stay unsupported', () => {
  for (const result of [
    resultFor({ sources: [{ ...source, text: positive, fetchedAt: undefined }] }),
  ]) assert.equal(accepted(vkSearchResultToDossier(result, place), positive), false);
  const dossier = vkSearchResultToDossier(resultFor({ summaryClaims: [{ claim: positive, sourceUrl: 'https://absent.example/', supported: true }] }), place);
  const supported = rows(dossier).filter((row) => row.supported === true);
  assert.ok(supported.length > 0);
  for (const row of supported) {
    assert.notEqual(row.sourceUrl, 'https://absent.example/');
    const page = dossier.pages.find((page) => page.url === row.sourceUrl);
    assert.ok(page);
    assert.equal(typeof page.fetchedAt, 'string');
    assert.ok(Number.isFinite(Date.parse(page.fetchedAt)));
    assert.equal(claimTextSupportedByPage(row.text, page.text), true);
    assert.ok(row.pages.length > 0);
    for (const id of row.pages) {
      assert.match(id, /^p[1-9]\d*$/);
      assert.equal(dossier.pages[Number(id.slice(1)) - 1], page);
    }
  }
});
test('explicit false unknown-source row cannot return as a supported saved-page excerpt', () => {
  const dossier = vkSearchResultToDossier(resultFor({ summaryClaims: [{ claim: positive, sourceUrl: 'https://absent.example/', supported: false }] }), place);
  for (const verified of [dossier, recitBotPrimaryFields(dossier), mergeBotPrimaryPresentedFields({}, dossier, place)]) {
    assert.equal(accepted(verified, positive), false);
    assert.equal(rows(verified).some((row) => row.supported === true && row.text.includes(positive)), false);
  }
});
test('absent claim verdict with voice true remains eligible on a supporting saved page', () => {
  const result = resultFor({ summaryClaims: [{ claim: positive, sourceUrl: url }] });
  const dossier = vkSearchResultToDossier(result, place);
  assert.equal(accepted(dossier, positive), true);
  assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), positive), true);
});
test('absent claim verdict cannot override a negated saved page', () => {
  const dossier = vkSearchResultToDossier(resultFor({ sources: [source], summaryClaims: [{ claim, sourceUrl: url }] }), place);
  assert.equal(accepted(dossier, claim), false);
  assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), claim), false);
});
test('absent voice remains eligible on a supporting saved page', () => {
  const result = resultFor({ summaryClaims: [{ claim: positive, sourceUrl: url }] });
  delete result.voicePass;
  const dossier = vkSearchResultToDossier(result, place);
  assert.equal(accepted(dossier, positive), true);
  assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), positive), true);
});
test('undefined voice verdict imposes no result-level veto', () => {
  const dossier = vkSearchResultToDossier(resultFor({ voicePass: {} }), place);
  assert.equal(accepted(dossier, positive), true);
  assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), positive), true);
});
test('false and present nonboolean claim verdicts cannot be recreated as page excerpts', () => {
  for (const supported of [false, undefined, 'true', 'yes', 1, null]) {
    const dossier = vkSearchResultToDossier(resultFor({ summaryClaims: [{ claim: positive, sourceUrl: url, supported }] }), place);
    assert.equal(accepted(dossier, positive), false, String(supported));
    assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), positive), false, `seed ${supported}`);
  }
});
test('explicit false voice cannot produce summary, hint, rating, or seed support', () => {
  const text = `${positive} Hotel opens 8am. Yelp rating 4.5 from 100 reviews.`;
  for (const claimSupportOk of [false]) {
    const dossier = vkSearchResultToDossier(resultFor({ voicePass: { claimSupportOk }, sources: [{ ...source, text }], hoursHint: 'Hotel opens 8am', rating: { primary: 4.5, primarySource: 'yelp', sourceUrl: url }, reviewCount: { yelp: 100 } }), place);
    assert.deepEqual(rows(dossier).filter((row) => row.supported === true), []);
    assert.equal(dossier.yelpRating, undefined);
    assert.equal(dossier.pages[0].braveRating, undefined);
    assert.deepEqual(rows(mergeBotPrimaryPresentedFields({}, dossier, place)).filter((row) => row.supported === true), []);
  }
});
test('store re-verification downgrades contradiction and rejected verdicts', () => {
  for (const [supported, pageText] of [[true, denial], [false, claim], [undefined, claim]]) {
    const dossier = { pages: [{ ...source, text: pageText }], fields: { summary: { value: claim, claims: [{ text: claim, sourceUrl: url, pages: ['p1'], supported }] } } };
    assert.equal(accepted(recitBotPrimaryFields(dossier), claim), false);
    assert.equal(accepted(mergeBotPrimaryPresentedFields(dossier, {}, place), claim), false);
  }
});
test('rendered positive values cannot hide behind a supported negative claim', () => {
  const dossier = recitBotPrimaryFields({ pages: [source], fields: { summary: { value: claim, claims: [{ text: denial, sourceUrl: url, pages: ['p1'], supported: true }] } } });
  assert.notEqual(dossier.fields.summary.value, claim);
});
test('full offline seed does not revive unapproved voice or false input claims', async () => {
  for (const result of [resultFor({ voicePass: { claimSupportOk: false } }), resultFor({ summaryClaims: [{ claim: positive, sourceUrl: url, supported: false }] })]) {
    const mem = new Map();
    const storeImpl = { async getDossier(key) { return mem.get(key) || null; }, async putDossier(key, value) { mem.set(key, structuredClone(value)); } };
    await runBotPrimarySeedTargets([{ placeId: 'r4-negation', title: place.title, category: place.category, dossierKey: 'r4-negation' }], { env: { VK_SEARCH_CENSUS_DIR: '/missing' }, storeImpl, gatherImpl: async () => vkSearchResultToDossier(result, place) });
    assert.equal(accepted(mem.get('r4-negation'), positive), false);
  }
});
test('store rejection also forbids new paraphrased excerpts from the cited page', () => {
  const text = 'Guests enjoy free breakfast daily and a rooftop pool beside the sunny garden terrace.';
  const dossier = { thing: place.title, pages: [{ ...source, text }], fields: { summary: { value: positive, claims: [{ text: positive, sourceUrl: url, pages: ['p1'], supported: false }] } } };
  const merged = mergeBotPrimaryPresentedFields(dossier, {}, place);
  assert.ok(!merged.fields.summary?.value);
  assert.equal(rows(merged).some((row) => row.text === text && row.supported === true), false);
});
test('rejected text blocks containing claims and substantial prefixes, not short subtexts', () => {
  const rejected = 'The hotel stands on the Upper West Side near Central Park';
  assert.equal(claimTextWasRejected(`Location: ${rejected}`, [rejected]), true);
  assert.equal(claimTextWasRejected('The hotel stands on the Upper West Side', [rejected]), true);
  assert.equal(claimTextWasRejected('The hotel stands', [rejected]), false);
  assert.equal(claimTextWasRejected('Upper West Side', [rejected]), false);
  assert.equal(claimTextWasRejected('Upper West Side near Central Park', [rejected]), false);
});
test('verification downgrades never become upstream rejections across repeated store reads', () => {
  const address = 'The hotel stands on the Upper West Side near Central Park';
  const body = 'Upper West Side guests enjoy spacious rooms beside a sunny garden terrace with breakfast daily.';
  const dossier = vkSearchResultToDossier({ voicePass: { claimSupportOk: true }, sources: [{ ...source, text: body }], summaryClaims: [{ claim: address, sourceUrl: 'https://absent.example/' }] }, place);
  assert.deepEqual(dossier.pages[0].rejectedClaimTexts, []);
  assert.equal(dossier.pages[0].summaryExcerptAllowed, true);
  dossier.fields.address = { value: address, claims: [{ text: address, sourceUrl: url, pages: ['p1'], supported: true }] };
  let verified = dossier;
  for (let index = 0; index < 3; index++) {
    verified = recitBotPrimaryFields(JSON.parse(JSON.stringify(verified)));
    assert.equal(verified.fields.address.claims[0].supported, false);
    assert.deepEqual(verified.pages[0].rejectedClaimTexts, []);
    assert.equal(verified.pages[0].summaryExcerptAllowed, true);
    assert.ok(verified.fields.summary.value.includes('Upper West Side'));
  }
});
test('explicitly rejected address does not poison independently sourced neighborhood text', () => {
  const address = 'The hotel stands on the Upper West Side near Central Park';
  const body = 'Upper West Side guests enjoy spacious rooms beside a sunny garden terrace with breakfast daily.';
  const otherUrl = 'https://hotel.example/location';
  const dossier = vkSearchResultToDossier({ voicePass: { claimSupportOk: true }, sources: [{ ...source, text: address }, { ...source, url: otherUrl, text: body }], summaryClaims: [{ claim: address, sourceUrl: url, supported: false }] }, place);
  assert.equal(dossier.pages[0].summaryExcerptAllowed, false);
  assert.equal(dossier.pages[1].summaryExcerptAllowed, true);
  assert.ok(dossier.fields.summary.value.includes('Upper West Side'));
  const verified = mergeBotPrimaryPresentedFields({}, dossier, place);
  assert.ok(verified.fields.summary.value.includes('Upper West Side'));
  assert.equal(accepted(verified, address), false);
});
test('nonboolean row verdicts do not reject other text or disable page excerpts', () => {
  const text = `${positive} Visitors also enjoy peaceful rooms and friendly staff throughout the week.`;
  const dossier = vkSearchResultToDossier(resultFor({ sources: [{ ...source, text }], summaryClaims: [{ claim: positive, sourceUrl: url, supported: null }] }), place);
  assert.deepEqual(dossier.pages[0].rejectedClaimTexts, []);
  assert.equal(dossier.pages[0].summaryExcerptAllowed, true);
  assert.equal(accepted(dossier, positive), false);
  assert.equal(accepted(dossier, text), true);
  assert.equal(accepted(mergeBotPrimaryPresentedFields({}, dossier, place), text), true);
});
