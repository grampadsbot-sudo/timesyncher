#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function verifiedPage(url, textBody) {
  const text = textBody.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

import { hoursValueLooksValid } from '../src/vacation/dossier-hours-fields.mjs';
import { pageNamesOtherVenue } from '../src/vacation/dossier-evidence-hydrate.mjs';
import {
  dossierReviewsNeedRebuild,
  dossierReviewsPassValidityGate,
  rebuildDossierReviewsFromSavedEvidence,
  stripDossierReviews,
} from '../src/vacation/dossier-reviews-rebuild.mjs';
import { patchLiveProductDetailBundle } from '../src/vacation/trek-thing-detail-patches.mjs';
import { applyDossierFields, computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { applyDossierRatingsAndReviews } from '../src/vacation/thing-dossier-ratings-copy.mjs';
import { detailHappyHour } from '../apps/vacation-client/src/lib/detailModel.mjs';
import {
  dossierBuilderPrompt,
  extractDossierReviews,
  fetchXaiPlaceRatings,
  judgeDossierFindings,
} from '../src/vacation/xai-grok-place-ratings.mjs';

assert.equal(hoursValueLooksValid('Mon-Sun 8am-7:30pm'), true);
assert.equal(hoursValueLooksValid('appetizing store and beyond'), false);
assert.equal(hoursValueLooksValid('00 PM Click here for matinee hours'), false);

const blueNote = { title: 'Blue Note Jazz Club', name: 'Blue Note Jazz Club', category: 'attraction' };
assert.equal(
  pageNamesOtherVenue({ url: 'https://jazz.org/dizzys', text: 'Dizzy\'s Club at Lincoln Center on Broadway.' }, blueNote),
  true,
);

const emptyReviews = { pages: [{ url: 'https://x.com', text: 'Blue Note Jazz Club hours and shows.' }], reviews: [] };
assert.equal(dossierReviewsNeedRebuild(emptyReviews, blueNote), true);
assert.equal(dossierReviewsPassValidityGate(emptyReviews, blueNote), false);

let writerRan = false;
const rebuilt = await rebuildDossierReviewsFromSavedEvidence(
  { ...emptyReviews, fields: { summary: { value: 'x', claims: [{ text: 'x', pages: ['p1'], supported: true }] } } },
  blueNote,
  {
    extractDossierReviews: async () => {
      writerRan = true;
      return { set: [{ id: 'r1', page: 'p1', text: 'Guests loved the late sets at Blue Note Jazz Club.' }], stats: {} };
    },
    callDossierBuilder: async () => {
      writerRan = true;
      return {
        findings: {
          reviews: [1, 2, 3, 4].map((i) => ({
            text: `Representative Blue Note review number ${i} with enough words about jazz and the room.`,
            rating: 5,
            claims: [{ text: 'late sets', pages: ['p1'], supported: true }],
          })),
        },
      };
    },
    judgeDossierFindings,
    judgeImpl: async (_d, ask) => ask.map((item) => ({ id: item.id, supported: true })),
  },
);
assert.equal(writerRan, true);
assert.ok((rebuilt.reviews || []).length >= 1 || (rebuilt.shortcomings || []).some((s) => s.field === 'reviews'));

const validReviews = {
  pages: [{ url: 'https://a', text: 'a' }, { url: 'https://b', text: 'b' }, { url: 'https://c', text: 'c' }],
  reviews: [1, 2, 3, 4].map((i) => ({
    text: `Valid supported review ${i} with enough words about the venue experience here.`,
    rating: 5,
    claims: [{ text: 'venue', pages: ['p1'], supported: true }],
  })),
  fieldHashes: { reviews: 'old' },
  fieldSources: { reviews: 'https://a' },
};
assert.equal(dossierReviewsPassValidityGate(validReviews, blueNote), true);
let noopWriter = false;
await rebuildDossierReviewsFromSavedEvidence(validReviews, blueNote, {
  extractDossierReviews: async () => { noopWriter = true; return { set: [], stats: {} }; },
  callDossierBuilder: async () => { noopWriter = true; return { findings: {} }; },
  judgeDossierFindings,
  judgeImpl: async () => [],
});
assert.equal(noopWriter, false, 'valid review gate must skip writer');

const carStripped = stripDossierReviews({
  reviewThemes: { praise: ['quiet ride'], complaints: [] },
  reviews: [{ text: 'x'.repeat(30), rating: 5, claims: [{ text: 'x', pages: ['p1'], supported: true }] }],
}, { category: 'car' });
assert.equal(carStripped.reviewThemes, null);
const carRecord = applyDossierRatingsAndReviews({ category: 'car' }, carStripped);
assert.equal(carRecord.reviewThemes, undefined);

const carboneApply = applyDossierFields(
  { category: 'restaurant', missingFields: ['address'] },
  {
    pages: [
      verifiedPage('https://carbone.com', '181 Thompson St New York'),
      verifiedPage('https://b.example/', 'second page body for verification'),
      verifiedPage('https://c.example/', 'third page body for verification'),
    ],
    fields: {
      address: { value: '181 Thompson St, New York, NY 10012', claims: [{ text: '181 Thompson', pages: ['p1'], supported: true }] },
    },
    reviews: [],
    shortcomings: [{ field: 'address', reason: 'stale' }],
  },
);
assert.equal(carboneApply.address, '181 Thompson St, New York, NY 10012');
assert.equal(carboneApply.missingFields.includes('address'), false);

const vagueAddress = applyDossierFields(
  { category: 'hotel' },
  {
    pages: [
      verifiedPage('https://a.example/', 'Hotel on Upper West Side'),
      verifiedPage('https://b.example/', 'second page body for verification'),
      verifiedPage('https://c.example/', 'third page body for verification'),
    ],
    fields: {
      address: { value: 'Upper West Side', claims: [{ text: 'Upper West Side', pages: ['p1'], supported: true }] },
    },
    shortcomings: [],
  },
);
assert.equal(vagueAddress.address, undefined);
assert.ok(vagueAddress.missingFields.includes('address'));

assert.equal(detailHappyHour({ happyHour: 'false', happyHourDetails: 'false' }), '');
assert.equal(detailHappyHour({ happyHour: false, happyHourDetails: '$1 oysters 5-7pm' }), '$1 oysters 5-7pm');

let builderCalls = 0;
const store = {
  rows: new Map(),
  async getDossier(key) {
    return this.rows.get(key) ? JSON.parse(JSON.stringify(this.rows.get(key))) : null;
  },
  async putDossier(key, dossier) {
    const { hashes, sources } = computeDossierFieldHashes(dossier);
    this.rows.set(key, { ...JSON.parse(JSON.stringify(dossier)), fieldHashes: hashes, fieldSources: sources });
  },
};
const dossierKey = 'trip:1:place:603';
const freshValid = {
  thing: 'Hotel Belleclaire',
  pages: [
    verifiedPage('https://a.example/', 'Belleclaire hotel summary and guest reviews on the Upper West Side.'),
    verifiedPage('https://b.example/', 'second page body for verification'),
    verifiedPage('https://c.example/', 'third page body for verification'),
  ],
  fields: {
    summary: {
      value: 'Summary with enough words about the Belleclaire hotel stay experience downtown.',
      claims: [{ text: 'Belleclaire hotel', pages: ['p1'], supported: true }],
    },
    description: {
      value: 'Description with enough words about the Belleclaire hotel stay experience downtown for guests.',
      claims: [{ text: 'Belleclaire', pages: ['p1'], supported: true }],
    },
    itineraryNote: {
      value: 'Book the Belleclaire for Upper West Side access.',
      claims: [{ text: 'Upper West Side', pages: ['p1'], supported: true }],
    },
    price: { value: 320, unit: 'per night', claims: [{ text: '320', pages: ['p1'], supported: true }] },
    hours: { value: 'Mon-Sun 24h', claims: [{ text: '24h', pages: ['p1'], supported: true }] },
  },
  knownFor: [{ item: 'roof deck', claims: [{ text: 'roof deck', pages: ['p1'], supported: true }] }],
  rating: 4.2,
  reviewsAvailable: 120,
  ratingEvidence: { quote: '4.2 stars', url: 'https://a.example/' },
  reviews: [1, 2, 3, 4].map((i) => ({
    text: `Belleclaire guest review ${i} with enough words about the hotel and service quality.`,
    rating: 4,
    claims: [{ text: 'hotel', pages: ['p1'], supported: true }],
  })),
};
await store.putDossier(dossierKey, freshValid);
const pass2 = await fetchXaiPlaceRatings({ id: 603, title: 'Hotel Belleclaire', category: 'hotel' }, {
  dossierKey,
  storeImpl: store,
  env: {},
  buildImpl: async () => { builderCalls += 1; return { findings: {}, structuredText: '{}', payload: {} }; },
  judgeImpl: async (_d, items) => items.map((item) => ({ id: item.id, supported: true })),
  extractReviewsImpl: async () => { throw new Error('extract must not run'); },
  gatherImpl: async () => { throw new Error('gather must not run'); },
});
assert.equal(builderCalls, 0, 'pass2 valid reviews must not invoke builder');
assert.equal(pass2.skipped, true);

const bundle = patchLiveProductDetailBundle(
  readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8'),
);
assert.match(bundle, /data-ts-detail-info-box":"address-hours"/);
assert.match(bundle, /data-ts-detail-info-box":"phone"/);
assert.match(bundle, /data-ts-detail-reviews":"1"/);

assert.doesNotMatch(
  dossierBuilderPrompt({ thing: 'Car', pages: [{ id: 'p1', text: 'fare' }] }, { includeReviews: false }),
  /Return reviews:/,
);

console.log('test_dossier_staging_fixes_682: ok');
