#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  applyDossierFields,
  computeDossierFieldHashes,
  dossierFieldHashesStale,
  prepareDossierFindings,
} from '../src/vacation/thing-dossier-fields.mjs';
import {
  changedDossierPageUrls,
  dossierNeedsRefresh,
  dossierPagesVerified,
  mergeDossierPages,
} from '../src/vacation/thing-evidence-dossier.mjs';
import {
  loadThingEvidenceDossier,
  saveThingEvidenceDossier,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { enrichPlaceRecordWithXaiRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

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
      return rows.get(key) || null;
    },
    async putDossier(key, dossier) {
      rows.set(key, JSON.parse(JSON.stringify(dossier)));
    },
  };
}

const urlA = 'https://example.com/a';
const urlB = 'https://example.com/b';
const urlC = 'https://example.com/c';
const quote = 'The house margherita arrives blistered from the wood oven every night';
const baseText = `Riverside Bistro review page. ${quote}. Published average 4.5 stars from 120 verified diner reviews.`;

const wrongHashPage = page(urlA, baseText);
wrongHashPage.sha256 = 'deadbeef';

assert.equal(dossierPagesVerified({ pages: [wrongHashPage] }), false, 'wrong page sha256 must fail verification');

const reviewBodies = Array.from({ length: 20 }, (_, index) =>
  `Review ${index + 1}: ${quote} with extra guest detail about pacing value and repeat visits this season.`);
const goodPages = [
  page(urlA, `${baseText} Menu lists happy hour oysters until six pm.`),
  page(urlB, reviewBodies.join(' ')),
  page(urlC, `${baseText} Article names the margherita as the signature pie.`),
];

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

const built = prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, findings);
assert.ok(built.rating > 0, 'verified dossier must retain cited rating');
assert.equal(built.reviews.length, 4, 'builder output must keep four representative reviews');

const rejected = prepareDossierFindings(
  { thing: 'Riverside Bistro', pages: goodPages, attempts: [] },
  { summary: { value: 'Invented summary', quote: 'not in any saved page', url: urlA } },
);
assert.equal(rejected.fields.summary, undefined, 'uncited summary must be omitted');

const record = enrichPlaceRecordWithXaiRatings({}, { evidenceDossier: built });
assert.equal(record.xaiRatingsFetched, true, 'verified dossier must mark ratings fetched');
assert.ok(record.review1, 'representative review text must land on the record');
assert.match(String(record.reviewsLabel), /Representative review written from 20 reviews/);

const empty = enrichPlaceRecordWithXaiRatings({ review1: 'stale' }, { evidenceDossier: { thing: 'Empty', pages: [], attempts: [] } });
assert.ok(empty.missingFields.includes('reviews'));
assert.ok(empty.missingFields.includes('ratings'));
assert.equal(empty.review1, undefined);

const merged = mergeDossierPages(
  { thing: 'Riverside Bistro', pages: [goodPages[0]], attempts: [] },
  { thing: 'Riverside Bistro', pages: [goodPages[1]], attempts: [{ kind: 'page', status: 'ok' }] },
);
assert.equal(merged.pages.length, 2);
assert.deepEqual(changedDossierPageUrls([goodPages[0]], [goodPages[0], goodPages[1]]), [urlB]);

const { hashes, sources } = computeDossierFieldHashes(built);
assert.equal(hashes.description, goodPages[0].sha256);
assert.equal(sources.description, urlA);
assert.equal(hashes.reviews, goodPages[1].sha256);
assert.equal(sources.reviews, urlB);
assert.equal(dossierFieldHashesStale({ fieldHashes: hashes, fieldSources: sources }, built), false);
assert.equal(
  dossierFieldHashesStale({ fieldHashes: hashes, fieldSources: sources }, {
    ...built,
    pages: goodPages.map((row, index) => (index === 0 ? page(urlA, 'changed text breaks hash dependency') : row)),
  }),
  true,
);

assert.equal(dossierNeedsRefresh({ pages: goodPages }, 60_000, Date.now() + 120_000), true, 'max-age must expire dossier');

useThingEvidenceDossierStore(memoryStore());
await saveThingEvidenceDossier('test:roundtrip', built);
const loaded = await loadThingEvidenceDossier('test:roundtrip');
assert.equal(loaded.thing, 'Riverside Bistro');
assert.equal(loaded.pages.length, 3);
useThingEvidenceDossierStore(null);

console.log('test_thing_evidence_dossier: ok');
