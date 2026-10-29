import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { claimTextContradictsPage, claimTextSupportedByPage } from '../src/vacation/dossier-claim-support.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { descriptionNamesThing } from '../src/vacation/thing-dossier-fields.mjs';

const HOME = 'https://www.arthousehotelnyc.com/';
const place = {
  id: 617,
  trip_id: 1,
  title: 'Arthouse Hotel',
  name: 'Arthouse Hotel',
  category: 'hotel',
  address: '2178 Broadway, New York, NY',
  url: HOME,
};

const census = loadVkSearchCensusResult(place);
assert.ok(census, 'census fixture 617 must load');
const bot = vkSearchResultToDossier(census, place);
const censusPage = bot.pages.find((page) => page.url === HOME);
assert.ok(censusPage?.text?.includes("won't"), '617 census page must include boilerplate with won\'t');

assert.equal(dossierPresented(bot, place), true, 'census adapter alone must present');
assert.equal(
  claimTextContradictsPage(bot.fields.summary.value, censusPage.text),
  false,
  'summary must not false-positive contradict repeated boilerplate',
);
assert.equal(
  claimTextContradictsPage(bot.fields.description.value, censusPage.text),
  false,
  'description must not false-positive contradict repeated boilerplate',
);

for (const field of ['summary', 'description']) {
  for (const claim of bot.fields[field].claims || []) {
    assert.equal(
      claimTextSupportedByPage(claim.text || claim.claim, censusPage.text),
      true,
      `${field} claim must stay supported on census page`,
    );
  }
}

const staleText = censusPage.text;
const stalePage = {
  url: HOME,
  fetchedAt: '2026-10-01T00:00:00Z',
  text: staleText,
  sha256: createHash('sha256').update(staleText).digest('hex'),
  via: 'brave',
};
const existing = {
  thing: place.title,
  pages: [stalePage],
  fields: {
    summary: { value: 'Legacy summary without supported claims', claims: [] },
    description: {
      value: 'Legacy description with enough words to satisfy older presented checks when claims were absent from the stored dossier body.',
      claims: [],
    },
  },
  attempts: [{ kind: 'brave', status: 'ok' }],
};

const mem = new Map([['trip:1:place:617', JSON.parse(JSON.stringify(existing))]]);
const storeImpl = {
  async getDossier(key) { return mem.get(String(key)) || null; },
  async putDossier(key, dossier) { mem.set(String(key), JSON.parse(JSON.stringify(dossier))); },
};

const seeded = await runBotPrimarySeedTargets([{
  rowId: 617,
  placeId: 617,
  tripId: 1,
  dossierKey: 'trip:1:place:617',
  title: place.title,
  category: 'hotel',
}], { env: {}, storeImpl });

assert.equal(seeded.results[0].fillPath, 'bot-census');
assert.equal(seeded.results[0].presented, true, 'live merge must keep census summary and description');
assert.equal(seeded.results[0].failed, undefined);

const stored = mem.get('trip:1:place:617');
const summary = String(stored.fields?.summary?.value || '').trim();
const description = String(stored.fields?.description?.value || '').trim();
assert.ok(summary.length >= 12, 'merged summary must remain');
assert.ok(description.length >= 40, 'merged description must remain');
assert.equal(descriptionNamesThing(summary, place.title), true);
assert.equal(descriptionNamesThing(description, place.title), true);
assert.equal(dossierPresented(stored, place), true);

const homePages = stored.pages.filter((page) => page.url === HOME);
assert.equal(homePages.length, 1, 'persistence merge must keep one saved page per cited URL');
assert.ok(
  claimTextSupportedByPage('Boutique Hotel on the Upper West Side', homePages[0].text),
  'home page must still support boutique claim after merge',
);

console.log(JSON.stringify({
  ok: true,
  checked: 'bot-census-617-live-merge',
  presented: seeded.results[0].presented,
  summaryWords: summary.split(/\s+/).length,
}));
