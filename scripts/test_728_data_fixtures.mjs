import assert from 'node:assert/strict';
import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { buildGateBSearchPlaceForRow } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { applyStoredDossiersToSharedTripSync } from '../src/vacation/shared-trip-dossier-overlay.mjs';

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
  const bot = vkSearchResultToDossier(census, place);
  assert.ok(bot.fields.summary?.value);
  assert.ok(bot.fields.description?.value);
  const badText = `${row.name}: How to Clean Window Screens and choose the right meat thermometer for your kitchen.`;
  const old = { thing: row.name, pages: [{ url: 'https://example.test/unrelated', fetchedAt: '2026-10-01T00:00:00Z', text: badText }], fields: {
    summary: { value: badText, claims: [{ text: badText, pages: ['p1'], sourceUrl: 'https://example.test/unrelated', supported: true }] },
  } };
  const merged = mergeBotPrimaryPresentedFields(old, bot, place);
  assert.equal(merged.pages.some((page) => page.text === badText), true, 'keep historical source bytes');
  assert.equal(merged.fields.summary.value.includes('Window Screens'), false, 'display the new venue narrative');
  assert.equal(merged.fields.description.value.includes('Window Screens'), false);
}

const blueNote = buildGateBSearchPlaceForRow(rows.find((row) => row.id === 660));
const selected = { places: [{ id: 660, name: blueNote.title, category_name: 'Event', website: blueNote.url, sourceRecord: blueNote.sourceRecord }], thingOverrides: { 'place:660': { logoUrl: 'https://www.bluenotejazz.com/favicon.ico' } } };
const result = applyStoredDossiersToSharedTripSync(selected, { 660: {
  thing: blueNote.title, pages: [{ url: blueNote.url, fetchedAt: '2026-10-28T00:00:00Z', text: blueNote.description }], fields: {},
} });
assert.equal(result.thingOverrides['place:660'].logoUrl, blueNote.sourceRecord.logoUrl);
assert.notEqual(result.thingOverrides['place:660'].logoUrl, 'https://www.bluenotejazz.com/favicon.ico');
console.log('728 data fixture tests passed');
