#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  computeDossierFieldHashes,
  dossierRebuildFields,
  mergeSelectiveDossierFindings,
  prepareDossierFindings,
} from '../src/vacation/thing-dossier-fields.mjs';
import { applyStoredDossiersToSharedTrip, applyStoredDossiersToSharedTripSync } from '../src/vacation/shared-trip-dossier-overlay.mjs';
import {
  loadThingEvidenceDossier,
  saveThingEvidenceDossier,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    async getDossier(key) {
      const row = rows.get(key);
      return row ? JSON.parse(JSON.stringify(row)) : null;
    },
    async putDossier(key, dossier) {
      const { hashes, sources } = computeDossierFieldHashes(dossier);
      rows.set(key, {
        ...JSON.parse(JSON.stringify(dossier)),
        fieldHashes: hashes,
        fieldSources: sources,
      });
    },
  };
}

const urlA = 'https://example.com/a';
const urlB = 'https://example.com/b';
const urlC = 'https://example.com/c';
const quote = 'The house margherita arrives blistered from the wood oven every night';
const baseText = `Riverside Bistro review page. ${quote}. Published average 4.5 stars from 120 verified diner reviews.`;
const reviewBodies = Array.from({ length: 20 }, (_, index) =>
  `Review ${index + 1}: ${quote} with extra guest detail about pacing value and repeat visits this season.`);

function goodPages(descriptionExtra = ' Menu lists happy hour oysters until six pm.') {
  return [
    page(urlA, `${baseText}${descriptionExtra}`),
    page(urlB, reviewBodies.join(' ')),
    page(urlC, `${baseText} Article names the margherita as the signature pie.`),
  ];
}

const findings = {
  summary: { value: 'Wood-fired pies and a deep negroni list', quote: 'wood-fired pies', url: urlA },
  description: {
    value: 'Riverside Bistro anchors the block with blistered Riverside Bistro pies, a deep negroni list, and happy hour oysters that regulars quote in every review thread online while the raw bar, pastry counter, and late-night espresso program keep the dining room busy from opening until close.',
    quote: 'happy hour oysters',
    url: urlA,
  },
  rating: { average: 4.5, count: 120, scaleMax: 5, quote: 'Average 4.5 stars from 120 verified diner reviews', url: urlA },
  knownFor: [{ item: 'margherita', quote: 'margherita as the signature pie', url: urlC }],
  reviewExcerpts: reviewBodies.map((body) => ({ quote: body, url: urlB })),
  reviews: [
    {
      text: 'The margherita blistered crust lived up to the signature hype, and the cocktail list stayed balanced through a busy Friday service evening while the dining room kept a steady pace.',
      rating: 5,
      cites: ['blistered from the wood oven'],
      verdict: true,
    },
    {
      text: 'Host stand efficiency stayed calm during the pre-show rush, and the team kept ticket pickup moving without making the lobby feel chaotic or rushed for first-time visitors.',
      rating: 4,
      cites: ['extra guest detail about pacing'],
      verdict: false,
    },
    {
      text: 'Sidewalk seating stayed comfortable even with passing traffic, and the staff checked in often enough that water refills and menu questions never had to wait long.',
      rating: 4,
      cites: ['wood oven every night'],
      verdict: false,
    },
    {
      text: 'Checkout timing was predictable on a packed night, and the margherita remained the dish guests mentioned most often when comparing this room to nearby options.',
      rating: 5,
      cites: ['repeat visits this season'],
      verdict: true,
    },
  ],
};

const built = prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages(), attempts: [] }, findings);
const { hashes, sources } = computeDossierFieldHashes(built);
built.fieldHashes = hashes;
built.fieldSources = sources;
assert.ok(hashes.reviews, 'reviews must track page-hash dependency');
assert.equal(sources.reviews, urlB);

let builderCalls = 0;
const store = memoryStore();
useThingEvidenceDossierStore(store);
const dossierKey = 'trip:99:place:42';
await saveThingEvidenceDossier(dossierKey, built, { storeImpl: store });

const place = { id: 42, trip_id: 99, title: 'Riverside Bistro', category: 'restaurant' };
const unchangedGather = async () => ({ thing: 'Riverside Bistro', pages: goodPages(), attempts: [] });
const buildImpl = async () => {
  builderCalls += 1;
  return { payload: {}, structuredText: '{}', findings };
};

const fresh = await fetchXaiPlaceRatings(place, {
  dossierKey,
  storeImpl: store,
  gatherImpl: unchangedGather,
  buildImpl,
  nowMs: Date.now(),
});
assert.equal(builderCalls, 0, 'unchanged pages must skip builder');
assert.equal(fresh.parsed.evidenceDossier.fields.description.value, built.fields.description.value);

builderCalls = 0;
const changedDescriptionGather = async () => ({
  thing: 'Riverside Bistro',
  pages: goodPages(' Menu lists happy hour oysters until six pm. Updated headline.'),
  attempts: [],
});
const changedOnlyDescription = await fetchXaiPlaceRatings(place, {
  dossierKey,
  storeImpl: store,
  gatherImpl: changedDescriptionGather,
  buildImpl,
  nowMs: Date.now(),
});
assert.equal(builderCalls, 1, 'changed description page must invoke builder once');
assert.equal(
  changedOnlyDescription.parsed.evidenceDossier.reviews[0].text,
  built.reviews[0].text,
  'unchanged review fields must stay byte-identical after selective rebuild',
);

builderCalls = 0;
const expired = await fetchXaiPlaceRatings(place, {
  dossierKey,
  storeImpl: store,
  gatherImpl: unchangedGather,
  buildImpl,
  nowMs: Date.now() + (8 * 24 * 60 * 60 * 1000),
});
assert.equal(builderCalls, 1, 'max-age expiry must refresh even when pages are unchanged');

const loaded = await loadThingEvidenceDossier(dossierKey, { storeImpl: store });
assert.equal(loaded.thing, 'Riverside Bistro');

const shared = {
  places: [{ id: 42, title: 'Riverside Bistro', category: 'restaurant', description: 'before' }],
  thingOverrides: {},
};
const served = await applyStoredDossiersToSharedTrip(shared, {
  storeImpl: store,
  dossierKeyForPlace: () => dossierKey,
});
assert.ok(served.thingOverrides['place:42']?.review1, 'served shared trip must consume the same injected store');
assert.equal(
  applyStoredDossiersToSharedTripSync(shared, { 42: built }).thingOverrides['place:42']?.review1,
  served.thingOverrides['place:42']?.review1,
);

const rebuild = dossierRebuildFields(built, {
  ...built,
  pages: goodPages(' Menu lists happy hour oysters until six pm. Updated headline.'),
}, { maxAgeExpired: false, changedUrls: [urlA] });
assert.ok(rebuild.has('description'));
assert.equal(rebuild.has('reviews'), false);

const partial = mergeSelectiveDossierFindings(built, {
  ...built,
  fields: { ...built.fields, description: { value: 'New only', quote: 'Updated headline', url: urlA } },
}, new Set(['description']));
assert.equal(partial.reviews[0].text, built.reviews[0].text);
assert.equal(partial.fields.description.value, 'New only');

useThingEvidenceDossierStore(null);
console.log('test_dossier_refresh_integration: ok');
