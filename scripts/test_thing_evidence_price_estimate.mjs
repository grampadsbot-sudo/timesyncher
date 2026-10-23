#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { applyDossierFields, prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';
import {
  PRICE_ESTIMATE_PREFIX,
  PRICE_ESTIMATE_UNAVAILABLE,
  buildPriceEstimateFromEvidence,
  priceEstimateAcknowledged,
} from '../src/vacation/thing-evidence-price-estimate.mjs';
import { searchPlaceOutputAcknowledgedViolations } from '../src/vacation/search-place-output.mjs';

function page(url, body) {
  const text = body.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

const menuPage = page(
  'https://example.com/menu',
  'House menu lists entrees from $32 per person and price range $$ on TripAdvisor.',
);

const dossierWithClaim = prepareDossierFindings(
  { thing: 'Sample Bistro', pages: [menuPage], attempts: [] },
  {
    price: {
      value: 32,
      unit: 'per person',
      claims: [{ text: 'entrees from 32 per person', pages: ['p1'], supported: true }],
    },
  },
);

const fromClaim = buildPriceEstimateFromEvidence(dossierWithClaim);
assert.match(fromClaim.label, new RegExp(`^${PRICE_ESTIMATE_PREFIX}:`));
assert.ok(fromClaim.citations.some((row) => row.pageId === 'p1'));

const tierOnly = buildPriceEstimateFromEvidence({
  pages: [page('https://reviews.example/x', 'Guests say this spot is moderate with price level $$')],
});
assert.match(tierOnly.label, /\$\$/);
assert.equal(tierOnly.citations[0].pageId, 'p1');

const unavailable = buildPriceEstimateFromEvidence({ pages: [page('https://example.com/x', 'No pricing mentioned here.')] });
assert.equal(unavailable.label, PRICE_ESTIMATE_UNAVAILABLE);

assert.equal(tierOnly.amount, null);
assert.doesNotMatch(tierOnly.label, /42/);

const parserCases = [
  ['first edition from 1944 for $200', null],
  ['Founded in 1960, this shop has no price list.', null],
  ['Tickets from 25 per person; price level moderate.', null],
  ['A taco costs $7.00.', null],
  ['Books cost $1 each.', null],
  ['A taco costs $ 7.00.', null],
  ['Tickets cost $0 per person.', null],
  ['Entrees from $7.00 per person.', 7, '$7.00'],
  ['Entrees from $72.35 per person.', 72.35, '$72.35'],
  ['Rooms from $1,234.56 per night.', 1234.56, '$1,234.56'],
  ['Tickets cost $7.00–$12.50 per person.', 9.75, '$7.00–$12.50'],
  ['Tickets from 1944 for $200.', null],
  ['Tickets from $7.001 per person.', null],
  ['Tickets from $1,23 per person.', null],
  ['A first edition costs $200. Admission is discussed elsewhere.', null],
  ['Tickets cost $200. Typical tickets cost $25.', 25, '$25'],
  ['Tickets cost $25. Tickets cost $200.', 25, '$25'],
  ['Cover charges range from $25–$40.', 32.5, '$25–$40'],
];
for (const [body, amount, label] of parserCases) {
  const estimate = buildPriceEstimateFromEvidence({ pages: [page('https://example.com/pricing', body)] });
  assert.equal(estimate.amount, amount, body);
  if (amount == null) {
    assert.equal(estimate.label, PRICE_ESTIMATE_UNAVAILABLE, body);
    assert.deepEqual(estimate.citations, [], body);
  } else {
    assert.ok(estimate.label.includes(label), body);
    assert.deepEqual(estimate.citations.map((row) => row.pageId), ['p1'], body);
  }
}

const acrossPages = buildPriceEstimateFromEvidence({ pages: [
  page('https://example.com/special', 'Tickets cost $200.'),
  page('https://example.com/typical', 'Typical tickets cost $25.'),
] });
assert.equal(acrossPages.amount, 25);
assert.deepEqual(acrossPages.citations.map((row) => row.pageId), ['p2']);

const falseClaim = buildPriceEstimateFromEvidence({
  pages: [page('https://example.com/claim', 'First edition from 1944 for $200. A taco costs $7.00.')],
  fields: { price: { value: 7235, unit: 'per person', claims: [
    { text: 'Typical price $7235 per person', pages: ['p1'], supported: true },
  ] } },
});
assert.equal(falseClaim.label, PRICE_ESTIMATE_UNAVAILABLE);
assert.deepEqual(falseClaim.citations, []);

const wrongCitation = buildPriceEstimateFromEvidence({
  pages: [
    page('https://example.com/claim', 'No pricing mentioned here.'),
    page('https://example.com/tickets', 'Tickets cost $25.'),
  ],
  fields: { price: { value: 25, unit: 'per person', claims: [
    { text: 'Tickets cost $25', pages: ['p1'], supported: true },
  ] } },
});
assert.equal(wrongCitation.amount, 25);
assert.deepEqual(wrongCitation.citations.map((row) => row.pageId), ['p2']);

const applied = applyDossierFields({}, dossierWithClaim);
assert.match(applied.priceEstimateLabel, new RegExp(`^${PRICE_ESTIMATE_PREFIX}:`));
assert.equal(applied.price, 32);
assert.equal(applied.missingFields.includes('price'), false);

const appliedMissing = applyDossierFields({}, {
  thing: 'No price place',
  pages: [page('https://example.com/y', 'Only hours listed here.')],
  attempts: [],
});
assert.equal(appliedMissing.priceEstimateLabel, PRICE_ESTIMATE_UNAVAILABLE);
assert.equal(appliedMissing.price, undefined);
assert.equal(appliedMissing.missingFields.includes('price'), false);

const contractPlace = {
  category: 'restaurant',
  title: 'No price place',
  summary: 'A long enough summary that names No price place and explains why diners keep returning for the room and the service every season.',
  description: 'No price place anchors the block with wood-fired pies, a deep negroni list, and happy hour oysters that regulars quote in every review thread online while the raw bar, pastry counter, and late-night espresso program keep the dining room busy from opening until close.',
  price: null,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.75,
  lng: -73.98,
  sourceRecord: {
    ...appliedMissing,
    googleRating: '4.5',
    googleReviewCount: '120',
    review1: 'The margherita blistered crust lived up to the signature hype, and the cocktail list stayed balanced through a busy Friday service evening while the dining room kept a steady pace.',
    review1Rating: '5',
    review1Source: 'Google',
    review2: 'Host stand efficiency stayed calm during the pre-show rush, and the team kept ticket pickup moving without making the lobby feel chaotic or rushed for first-time visitors.',
    review2Rating: '4',
    review2Source: 'Yelp',
    review3: 'Sidewalk seating stayed comfortable even with passing traffic, and the staff checked in often enough that water refills and menu questions never had to wait long.',
    review3Rating: '4',
    review3Source: 'TripAdvisor',
    review4: 'Checkout timing was predictable on a packed night, and the margherita remained the dish guests mentioned most often when comparing this room to nearby options.',
    review4Rating: '5',
    review4Source: 'Google',
  },
};
assert.equal(priceEstimateAcknowledged(contractPlace), true);
assert.deepEqual(searchPlaceOutputAcknowledgedViolations(contractPlace), []);

console.log('thing evidence price estimate checks passed');
