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
