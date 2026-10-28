#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  beginDossierXaiUsageRun,
  commitDossierXaiUsageRun,
  dossierForReviewWriter,
} from '../src/vacation/dossier-cost.mjs';
import { stripDossierReviews } from '../src/vacation/dossier-reviews-rebuild.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import {
  dossierBuilderPrompt,
  dossierBuilderReviewsOnly,
  fetchXaiPlaceRatings,
} from '../src/vacation/xai-grok-place-ratings.mjs';

function page(url, textBody) {
  const body = textBody.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const carPlace = { id: 609, title: 'Priceline opaque Standard sedan', category: 'car' };
const stripped = stripDossierReviews({
  reviews: [{ text: 'should not stay', rating: 5, claims: [{ text: 'x', pages: ['p1'], supported: true }] }],
  reviewSet: [{ id: 'r1', text: 'x', page: 'p1' }],
}, carPlace);
assert.equal(stripped.reviews.length, 0);
assert.equal(stripped.reviewSet.length, 0);

const flightPrompt = dossierBuilderPrompt({
  thing: 'LAS-JFK flight',
  pages: [page('https://aa.com', 'Route LAS-JFK nonstop fare 257 dollars basic economy.')],
  reviewSet: [{ id: 'r1', page: 'p1', text: 'ignored' }],
}, { includeReviews: false });
assert.doesNotMatch(flightPrompt, /Return reviews: four/);
assert.match(flightPrompt, /do not return reviews/i);

const reviewPages = [
  page('https://yelp.com/a', `${'Great food and friendly staff. '.repeat(80)}`),
  page('https://yelp.com/b', `${'Slow service but good pasta. '.repeat(80)}`),
  page('https://site.com', `${'Official menu and hours only. '.repeat(40)}`),
];
const reviewSet = [
  { id: 'r1', page: 'p1', text: 'Great food and friendly staff on our visit last month.' },
  { id: 'r2', page: 'p2', text: 'Slow service but the pasta was worth the wait anyway.' },
];
const slim = dossierForReviewWriter({ thing: 'Test Place', pages: reviewPages, reviewSet });
const slimJson = JSON.stringify(slim);
assert.ok(slimJson.length < 12000, `review writer payload should stay near 10k chars, got ${slimJson.length}`);
assert.equal(slim.pages.length, 2);

const reviewOnly = dossierBuilderReviewsOnly(new Set(['reviews']));
assert.equal(reviewOnly, true);
assert.equal(dossierBuilderReviewsOnly(new Set(['reviews', 'description'])), false);

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

const dossierKey = 'trip:99:place:609';
const carDossier = {
  thing: 'Priceline opaque Standard sedan',
  pages: [page('https://priceline.com/jfk', 'Standard sedan 44 per day 306 total taxes included at JFK.')],
  fields: {
    summary: { value: 'Opaque JFK sedan card.', claims: [{ text: '306 total', pages: ['p1'], supported: true }] },
  },
  reviews: [],
  attempts: [],
};
await store.putDossier(dossierKey, carDossier);

const carFetch = await fetchXaiPlaceRatings(carPlace, {
  dossierKey,
  storeImpl: store,
  env: {},
  buildImpl: async () => {
    builderCalls += 1;
    return { payload: {}, structuredText: '{}', findings: { summary: { value: 'x', claims: [{ text: '306 total', pages: ['p1'] }] } } };
  },
  judgeImpl: async (_dossier, items) => items.map((item) => ({ id: item.id, supported: true })),
  extractReviewsImpl: async () => {
    throw new Error('extract must not run for car rows');
  },
  gatherImpl: async () => { throw new Error('gather must not run'); },
});
assert.equal(builderCalls, 0, 'unchanged car dossier must skip builder entirely');
assert.equal(carFetch.parsed.evidenceDossier.reviews?.length || 0, 0);

const usageDossier = {};
beginDossierXaiUsageRun(usageDossier, { xaiUsage: [{ step: 'prior', usd: 0.1 }] });
usageDossier.xaiUsage.push({ step: 'builder', usd: 0.2 });
const run = commitDossierXaiUsageRun(usageDossier, { xaiUsage: [{ step: 'prior', usd: 0.1 }] }, { kind: 'test' });
assert.equal(usageDossier.xaiUsage.length, 2);
assert.equal(run.usd, 0.2);
assert.equal(usageDossier.xaiUsageRuns.length, 1);

console.log('test_dossier_cost_682: ok');
