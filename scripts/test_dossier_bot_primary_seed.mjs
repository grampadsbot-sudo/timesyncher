import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  mergeBotPrimaryPresentedFields,
  runBotPrimarySeedTargets,
} from '../src/vacation/dossier-bot-primary-seed.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';

const place = {
  id: 603,
  trip_id: 99,
  title: 'Hotel Belleclaire Central Park',
  name: 'Hotel Belleclaire Central Park',
  category: 'hotel',
  category_name: 'hotel',
  address: 'Upper West Side, New York, NY',
  url: 'https://www.hotelbelleclaire.com/',
};

const pageText = 'Hotel Belleclaire Central Park sits on the Upper West Side near Lincoln Center with Booking.com guests praising compact rooms included breakfast and an easy subway link to Central Park and Midtown theaters. The Belleclaire works well as a week-long base when you want a quieter residential block after long museum and show days.';
const summaryClaim = 'Hotel Belleclaire Central Park works well as a quieter Upper West Side base near Lincoln Center and Central Park.';
const bot = {
  thing: place.title,
  pages: [{
    url: 'https://www.hotelbelleclaire.com/',
    text: pageText,
    fetchedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(pageText).digest('hex'),
  }],
  fields: {
    summary: { value: summaryClaim, claims: [{ text: summaryClaim, sourceUrl: 'https://www.hotelbelleclaire.com/', pages: ['p1'], supported: true }] },
    description: { value: pageText, claims: [{ text: pageText, sourceUrl: 'https://www.hotelbelleclaire.com/', pages: ['p1'], supported: true }] },
  },
  attempts: [{ provider: 'vk-search', status: 'ok' }],
};

const merged = mergeBotPrimaryPresentedFields({}, bot, place);
const verified = {
  ...merged,
  pages: merged.pages.map((page) => ({
    ...page,
    fetchedAt: page.fetchedAt || new Date().toISOString(),
    sha256: createHash('sha256').update(String(page.text || '')).digest('hex'),
  })),
};
assert.equal(dossierPresented(verified, place), true);

const mem = new Map();
const storeImpl = {
  async getDossier(key) { return mem.get(String(key)) || null; },
  async putDossier(key, dossier) { mem.set(String(key), JSON.parse(JSON.stringify(dossier))); },
};

const seeded = await runBotPrimarySeedTargets([{
  title: place.title,
  category: 'hotel',
  placeId: place.id,
  rowId: place.id,
  tripId: 99,
  dossierKey: 'trip:99:place:603',
  address: place.address,
  url: place.url,
}], {
  env: { VK_SEARCH_CENSUS_DIR: '/missing' },
  storeImpl,
  gatherImpl: async () => bot,
});

assert.equal(seeded.xaiCalled, 0);
assert.equal(seeded.fillPath, 'bot-primary');
assert.equal(seeded.results[0].presented, true);
assert.equal(seeded.results[0].xaiCalled, false);
const stored = await storeImpl.getDossier('trip:99:place:603');
assert.ok(stored?.fields?.summary?.value);
assert.ok(stored?.fields?.description?.value);
assert.equal(dossierPresented(stored, place), true);

console.log(JSON.stringify({
  ok: true,
  presented: true,
  summaryWords: stored.fields.summary.value.split(/\s+/).length,
  descriptionWords: stored.fields.description.value.split(/\s+/).length,
  fillPath: 'bot-primary',
  xaiCalled: 0,
  pageCount: stored.pages.length,
}));
