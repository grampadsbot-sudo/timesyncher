import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';

const source = { url: 'https://garden.test/info', fetchedAt: '2026-10-28T00:00:00Z', text: 'A quiet garden terrace serving fresh seasonal vegetables.' };
test('absent hints never default to first page', () => {
  const dossier = vkSearchResultToDossier({ sources: [source], hoursHint: '9am–5pm', priceHint: '$50', happyHourHint: 'Cocktails 4pm–6pm', itineraryNoteCandidate: 'Reserve the rooftop pool', voicePass: { claimSupportOk: true } }, { title: 'Garden House' });
  for (const key of ['hours', 'price', 'happyHourDetails', 'itineraryNote']) assert.equal(dossier.fields[key], undefined, key);
});
test('explicit unrelated page is never replaced', () => {
  const value = 'Cocktails 4pm–6pm';
  const dossier = vkSearchResultToDossier({ sources: [source, { ...source, url: 'https://garden.test/bar', text: value }], happyHourHint: { value, sourceUrl: source.url } }, { title: 'Garden House' });
  assert.equal(dossier.fields.happyHourDetails, undefined);
});
test('a saved dated page can honestly support an implicit hint', () => {
  const value = '9am–5pm';
  const dossier = vkSearchResultToDossier({ sources: [{ ...source, text: value }], hoursHint: value }, { title: 'Garden House' });
  assert.equal(dossier.fields.hours.value, value);
  assert.equal(dossier.fields.hours.claims[0].sourceUrl, source.url);
});
