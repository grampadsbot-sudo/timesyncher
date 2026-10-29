import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { claimTextSupportedByPage } from '../src/vacation/dossier-claim-support.mjs';
import { descriptionNamesThing } from '../src/vacation/thing-dossier-fields.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

const HOME = 'https://www.hotelbelleclaire.com/';
const place = {
  id: 603,
  trip_id: 1,
  title: 'Hotel Belleclaire Central Park',
  name: 'Hotel Belleclaire Central Park',
  category: 'hotel',
  address: '2175 Broadway, New York, NY',
  url: HOME,
};
const summaryClaim = 'Hotel Belleclaire, 2175 Broadway';

const census = loadVkSearchCensusResult(place);
assert.ok(census, 'census fixture 603 must load');
const bot = vkSearchResultToDossier(census, place);
for (const page of bot.pages) {
  if (!page.sha256) page.sha256 = createHash('sha256').update(String(page.text || '')).digest('hex');
}

const staleText = 'Beaux-Arts Landmark Hotel on the Upper West Side with rooms and suites. Book direct benefits without the Broadway address line.';
const stalePage = {
  url: HOME,
  fetchedAt: '2026-10-01T00:00:00Z',
  text: staleText,
  sha256: createHash('sha256').update(staleText).digest('hex'),
  via: 'brave',
};
const existing = {
  thing: place.title,
  pages: [stalePage, ...bot.pages.filter((page) => page.url !== HOME)],
  fields: {
    summary: { value: 'Legacy summary text without supported claims', claims: [] },
    description: {
      value: 'Legacy description with enough words to satisfy older presented checks when claims were absent from the stored dossier body.',
      claims: [],
    },
  },
  attempts: [{ kind: 'brave', status: 'ok' }],
};

const mem = new Map([['trip:1:place:603', JSON.parse(JSON.stringify(existing))]]);
const storeImpl = {
  async getDossier(key) { return mem.get(String(key)) || null; },
  async putDossier(key, dossier) { mem.set(String(key), JSON.parse(JSON.stringify(dossier))); },
};

const seeded = await runBotPrimarySeedTargets([{
  rowId: 603,
  placeId: 603,
  tripId: 1,
  dossierKey: 'trip:1:place:603',
  title: place.title,
  category: 'hotel',
}], { env: {}, storeImpl });

assert.equal(seeded.results[0].fillPath, 'bot-census');
assert.ok(bot.pages.some((page) => page.url === HOME), 'census fixture 603 must include a bot-saved home page');
assert.equal(seeded.results[0].pageCount, 1 + bot.pages.length, 'archived stale home kept; every bot-saved page (incl. bot home) appended');

const stored = mem.get('trip:1:place:603');
const homePages = stored.pages.filter((page) => page.url === HOME);
assert.equal(homePages.length, 2, 'persistence keeps archived and bot-saved bytes for the same URL');
const botHomePage = homePages.find((page) => claimTextSupportedByPage(summaryClaim, page.text));
assert.ok(botHomePage, 'bot-saved home page text must contain the summary claim verbatim');

const summaryField = stored.fields?.summary;
assert.ok(String(summaryField?.value || '').trim(), 'summary value must remain after merge');
const supportedClaims = (summaryField?.claims || []).filter((claim) => claim.supported === true);
assert.equal(supportedClaims.length, (summaryField?.claims || []).length, 'every merged summary claim stays supported');
assert.ok(supportedClaims.length >= 1);
for (const claim of supportedClaims) {
  const page = stored.pages[Number(claim.pages[0].slice(1)) - 1];
  assert.ok(page && claimTextSupportedByPage(claim.text, page.text), `claim cites a page that supports it: ${claim.text}`);
}
const homeClaim = supportedClaims.find((claim) => stored.pages[Number(claim.pages[0].slice(1)) - 1]?.url === HOME);
assert.ok(homeClaim, 'at least one supported summary claim cites the bot-saved home page');
assert.ok(
  String(stored.fields?.summary?.value || '').includes('2175 Broadway'),
  'merged summary keeps census essence text',
);

const censusSummary = text(census.fields?.summary?.value ?? '');
const storedSummary = text(stored.fields?.summary?.value ?? '');
const summaryNamesThing = descriptionNamesThing(censusSummary, place.title);
const expectedPresented = dossierPresented(stored, place);
assert.equal(
  descriptionNamesThing(storedSummary, place.title),
  summaryNamesThing,
  'merged summary keeps census name gate',
);
assert.equal(seeded.results[0].presented, expectedPresented);
assert.equal(seeded.results[0].presented, dossierPresented(stored, place));
assert.equal(
  summaryNamesThing,
  censusSummary.length >= 12
    && words(censusSummary) >= 12
    && descriptionNamesThing(censusSummary, stored.thing || place.title),
  'presented summary leg matches computeDossierFieldCounts inputs',
);

const counts = computeDossierFieldCounts(stored, place);
if (!expectedPresented) {
  assert.equal(counts.summary?.status, 'missing');
  assert.equal(summaryNamesThing, false, '603 census names Hotel Belleclaire, not full Central Park title');
  assert.ok(
    supportedClaims.every((claim) => claim.supported === true
      && claimTextSupportedByPage(claim.text, cited.text)),
    'claim support stays ok while name gate blocks presented',
  );
  assert.deepEqual(
    seeded.results[0].presentedReasons?.filter((row) => /summary/i.test(String(row))),
    ['summary:missing'],
  );
} else {
  assert.equal(seeded.results[0].failed, undefined);
}

const botAlignedTitle = 'Hotel Belleclaire';
assert.ok(
  descriptionNamesThing(storedSummary, botAlignedTitle),
  'same census summary presents once the trip title matches bot naming',
);
assert.equal(
  dossierPresented({ ...stored, thing: botAlignedTitle }, { ...place, title: botAlignedTitle }),
  true,
);

console.log(JSON.stringify({
  ok: true,
  checked: 'bot-census-saved-page-wins-merge-603',
  homePages: homePages.length,
  presented: dossierPresented(stored, place),
}));
