import assert from 'node:assert/strict';
import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { buildGateBSearchPlaceForRow } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { applyStoredDossiersToSharedTripSync } from '../src/vacation/shared-trip-dossier-overlay.mjs';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeWhitespace = (value) => String(value || '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
const sourceSearchText = (source) => [source?.title, source?.text, source?.snippet].filter(text).join('\n');
const resolveStringClaimBody = (body, sources) => {
  const claimBody = text(body);
  if (!claimBody) return null;
  for (const source of sources) {
    const page = normalizeWhitespace(sourceSearchText(source));
    const claim = normalizeWhitespace(claimBody);
    if (claim && page.includes(claim)) {
      return { claim: claimBody, text: claimBody, sourceUrl: source.url };
    }
  }
  return null;
};
const normalizeSummaryClaimEntry = (claim, sources) => {
  if (typeof claim === 'string') return resolveStringClaimBody(claim, sources);
  if (claim && typeof claim === 'object') return claim;
  return null;
};
const censusBotNarrative = (census) => {
  const written = census?.fields && typeof census.fields === 'object' ? census.fields
    : census?.dossierFields && typeof census.dossierFields === 'object' ? census.dossierFields : null;
  return {
    summary: text(written?.summary?.value),
    description: text(written?.description?.value),
  };
};
const inlineBotFieldsFromCensus = (census) => {
  const sources = Array.isArray(census?.sources) ? census.sources : [];
  const rawClaims = Array.isArray(census?.summaryClaims) ? census.summaryClaims : [];
  const claims = rawClaims.map((entry) => normalizeSummaryClaimEntry(entry, sources)).filter(Boolean);
  const primary = claims.find((row) => row?.supported === true && text(row.claim || row.text)) || claims[0];
  const secondary = claims.find((row) => row !== primary && text(row.claim || row.text)) || primary;
  const summaryText = text(primary?.claim || primary?.text);
  const descriptionText = text(secondary?.claim || secondary?.text) || summaryText;
  const summaryUrl = text(primary?.sourceUrl);
  const descriptionUrl = text(secondary?.sourceUrl) || summaryUrl;
  if (!summaryText || !summaryUrl) return null;
  return {
    summary: {
      value: summaryText,
      claims: [{ text: summaryText, sourceUrl: summaryUrl, supported: true }],
    },
    description: {
      value: descriptionText,
      claims: [{ text: descriptionText, sourceUrl: descriptionUrl, supported: true }],
    },
  };
};

const rows = buildNycCraigKimDaybydayFixtureRows();
assert.equal(rows.some((row) => row.id === 679), false, 'domain-sale-only venue stays off the data inventory');
const cars = rows.filter((row) => row.cat === 'car');
assert.equal(cars.length, 7);
for (const [id, total] of [[710, 366], [711, 395], [712, 398], [713, 395], [714, 399], [715, 402]]) {
  const row = cars.find((row) => row.id === id);
  assert.ok(row.listOnly, 'adding a car choice must not select it for the itinerary');
  const place = buildGateBSearchPlaceForRow(row);
  assert.equal(place.category, 'car');
  assert.equal(place.price, total, 'use the saved rental total rather than the per-day floor');
  assert.equal(new URL(place.sourceRecord.logoUrl).hostname, `www.${place.sourceRecord.rentalCompany.toLowerCase()}.com`);
  assert.ok(place.sourceRecord.carType);
  assert.ok(place.sourceRecord.pickupLocation);
  assert.ok(place.sourceRecord.returnLocation);
  assert.ok(place.sourceRecord.description.includes('benchmark'));
}

for (const id of [614, 677, 678]) {
  const row = rows.find((row) => row.id === id);
  const place = { ...buildGateBSearchPlaceForRow(row), id };
  const census = loadVkSearchCensusResult(place, { env: {} });
  const botFromCensus = vkSearchResultToDossier(census, place);
  const narrative = censusBotNarrative(census);
  const voiceOk = census?.voicePass?.claimSupportOk === true;
  if (voiceOk) {
    if (narrative.summary) {
      assert.equal(botFromCensus.fields.summary?.value, narrative.summary);
    } else {
      assert.equal(botFromCensus.fields.summary?.value, undefined);
    }
    if (narrative.description) {
      assert.equal(botFromCensus.fields.description?.value, narrative.description);
    } else {
      assert.equal(botFromCensus.fields.description?.value, undefined);
    }
    const inlineFields = inlineBotFieldsFromCensus(census);
    assert.ok(inlineFields, `row ${id} census must cite at least one saved page for inline bot narrative`);
    const bot = vkSearchResultToDossier({ ...census, fields: inlineFields }, place);
    assert.equal(bot.fields.summary?.value, inlineFields.summary.value);
    assert.equal(bot.fields.description?.value, inlineFields.description.value);
    const badText = `${row.name}: How to Clean Window Screens and choose the right meat thermometer for your kitchen.`;
    const old = { thing: row.name, pages: [{ url: 'https://example.test/unrelated', fetchedAt: '2026-10-01T00:00:00Z', text: badText }], fields: {
      summary: { value: badText, claims: [{ text: badText, pages: ['p1'], sourceUrl: 'https://example.test/unrelated', supported: true }] },
    } };
    const merged = mergeBotPrimaryPresentedFields(old, botFromCensus, place);
    assert.equal(merged.pages.some((page) => page.text === badText), true, 'keep historical source bytes');
    assert.equal(merged.fields.summary.value.includes('Window Screens'), false, 'display the new venue narrative');
    assert.equal(merged.fields.description.value.includes('Window Screens'), false);
  } else {
    assert.equal(botFromCensus.fields.summary?.value, undefined);
    assert.equal(botFromCensus.fields.description?.value, undefined);
    assert.equal(botFromCensus.attempts[0].status, 'claim_support_failed');
    const inlineFields = inlineBotFieldsFromCensus(census);
    assert.ok(inlineFields, `row ${id} inline helper must still resolve object claims to saved URLs`);
    const bot = vkSearchResultToDossier({ ...census, fields: inlineFields }, place);
    assert.equal(bot.fields.summary?.value, undefined, 'false voicePass must not present injected narrative');
    assert.equal(bot.fields.description?.value, undefined);
    assert.equal(bot.attempts[0].status, 'claim_support_failed');
  }
}

assert.equal(
  inlineBotFieldsFromCensus({ sources: [{ url: 'https://example.test/a', text: 'Saved venue bytes only.' }], summaryClaims: ['Fabricated claim absent from page'] }),
  null,
  'unresolvable string summaryClaims must not synthesize inline narrative',
);

const blueNote = buildGateBSearchPlaceForRow(rows.find((row) => row.id === 660));
const selected = { places: [{ id: 660, name: blueNote.title, category_name: 'Event', website: blueNote.url, sourceRecord: blueNote.sourceRecord }], thingOverrides: { 'place:660': { logoUrl: 'https://www.bluenotejazz.com/favicon.ico' } } };
const result = applyStoredDossiersToSharedTripSync(selected, { 660: {
  thing: blueNote.title, pages: [{ url: blueNote.url, fetchedAt: '2026-10-28T00:00:00Z', text: blueNote.description }], fields: {},
} });
assert.equal(result.thingOverrides['place:660'].logoUrl, blueNote.sourceRecord.logoUrl);
assert.notEqual(result.thingOverrides['place:660'].logoUrl, 'https://www.bluenotejazz.com/favicon.ico');
console.log('728 data fixture tests passed');
