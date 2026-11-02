#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  applyDossierFields,
  applyDossierRatingsAndReviews,
} from '../src/vacation/thing-dossier-fields.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const googlePage = page('https://www.google.com/maps/place/x', 'Rated 4.6 from 900 reviews on Google.');
googlePage.braveRating = { average: 4.6, count: 900, scaleMax: 5, url: googlePage.url, source: 'Google' };
const yelpPage = page('https://www.yelp.com/biz/x', 'Yelp rating 4.2 from 120 reviews.');
yelpPage.braveRating = { average: 4.2, count: 120, scaleMax: 5, url: yelpPage.url, source: 'Yelp' };

const dossier = {
  thing: 'Sample Bistro',
  pages: [googlePage, yelpPage],
  attempts: [],
  reviews: [{
    text: 'The rigatoni was excellent and the service stayed attentive through a busy Friday dinner service.',
    rating: 5,
    claims: [{ text: 'rigatoni was excellent', pages: ['p2'], supported: true }],
    verdict: true,
  }, {
    text: 'Portions felt generous for the price and the dining room stayed calm even when every table was full.',
    rating: 4,
    claims: [{ text: 'Portions felt generous', pages: ['p2'], supported: true }],
    verdict: false,
  }, {
    text: 'Dessert pacing was smooth and the staff checked in often enough that refills never waited long.',
    rating: 4,
    claims: [{ text: 'staff checked in often', pages: ['p2'], supported: true }],
    verdict: false,
  }, {
    text: 'The bar program stayed balanced and the signature cocktail lived up to the menu hype on our visit.',
    rating: 5,
    claims: [{ text: 'signature cocktail lived up', pages: ['p2'], supported: true }],
    verdict: true,
  }],
  reviewExcerpts: [{ text: 'sample', pages: ['p2'], supported: true }],
  reviewsRead: 40,
  reviewSources: ['google.com', 'yelp.com', 'tripadvisor.com'],
  knownFor: [{ item: 'rigatoni', claims: [{ text: 'rigatoni', pages: ['p1'], supported: true }] }],
  rating: 4.5,
  reviewsAvailable: 500,
  fields: {
    summary: { value: 'Wood-fired pasta and a deep negroni list at Sample Bistro for pre-theater dinners.', claims: [{ text: 'pasta', pages: ['p1'], supported: true }] },
    description: { value: 'Sample Bistro anchors the block with Sample Bistro rigatoni, a deep negroni list, and happy hour oysters that regulars quote in every review thread online while the raw bar, pastry counter, and late-night espresso program keep the dining room busy from opening until close.', claims: [{ text: 'rigatoni', pages: ['p1'], supported: true }] },
  },
};

const ratingsOnly = {};
applyDossierRatingsAndReviews(ratingsOnly, dossier);
assert.equal(ratingsOnly.googleRating, '4.6');
assert.equal(ratingsOnly.googleReviewCount, '900');
assert.equal(ratingsOnly.yelpRating, '4.2');
assert.ok(Array.isArray(ratingsOnly.otherRatingSites) || ratingsOnly.yelpRating);

const record = applyDossierFields({}, dossier);
assert.equal(record.googleRating, '4.6');
assert.equal(record.yelpReviewCount, '120');
assert.ok(record.review1);
assert.match(String(record.reviewsLabel), /reviews/);

console.log('test_apply_dossier_ratings_copy: ok');
