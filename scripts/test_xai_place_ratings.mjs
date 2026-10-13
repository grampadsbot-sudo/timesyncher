#!/usr/bin/env node
import assert from 'node:assert/strict';

import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';
import {
  applyXaiPlaceRatingsToRecord,
  formatOtherRatingsDisplay,
  parseXaiResponsesPayload,
  writeRepresentativeReviews,
} from '../src/vacation/xai-place-ratings.mjs';

const mockPayload = {
  usage: { cost_in_usd_ticks: 68000 },
  output: [{
    type: 'message',
    content: [{
      type: 'output_text',
      text: JSON.stringify({
        google: { average: 4.8, count: 11931, sourceUrl: 'https://www.google.com/maps/place/example' },
        yelp: { average: 4.5, count: 10564, sourceUrl: 'https://www.yelp.com/biz/example' },
        otherSites: [
          { average: 4.7, count: 15309, sourceUrl: 'https://www.example-aggregates.test/place' },
          { average: 4.6, count: 2300, sourceUrl: 'https://www.opentable.com/example' },
          { average: 4.4, count: 812, sourceUrl: 'https://www.facebook.com/example' },
        ],
        themes: [
          'Fresh seafood and sunset views draw most praise',
          'Reservations are hard to get on weekends',
          'Service is warm but pacing can feel rushed',
          'Portions are generous for the price point',
        ],
        flavour: 'Pacific fish, coconut curry, and oceanfront seating',
      }),
    }],
  }],
};

const parsed = parseXaiResponsesPayload(mockPayload);
assert.equal(parsed.costUsdTicks, 68000);
assert.equal(parsed.google.count, 11931);
assert.equal(parsed.otherSites.length, 3);

const otherDisplay = formatOtherRatingsDisplay(parsed.otherSites);
assert.equal(otherDisplay.thirdPartyRating, '4.7 · 4.6 · 4.4');
assert.equal(otherDisplay.thirdPartyReviewCount, '15,309 · 2,300 · 812');
assert.equal(otherDisplay.otherRatings.length, 3);
assert.ok(otherDisplay.otherRatings.every((row) => row.sourceUrl));

const record = applyXaiPlaceRatingsToRecord({}, parsed, { title: 'Harbor Grill' });
assert.equal(record.googleRating, '4.8');
assert.equal(record.googleReviewCount, '11931');
assert.equal(record.yelpRating, '4.5');
assert.equal(record.yelpReviewCount, '10564');
assert.equal(record.thirdPartyRating, otherDisplay.thirdPartyRating);
assert.equal(record.ratingCount, 11931);
assert.equal(record.ratingMix, undefined);
assert.ok(Array.isArray(record.reviewThemes) && record.reviewThemes.length >= 4);

for (let index = 1; index <= 4; index += 1) {
  const body = String(record[`review${index}`] || '');
  const source = String(record[`review${index}Source`] || '');
  const rating = String(record[`review${index}Rating`] || '');
  assert.ok(body.split(/\s+/).filter(Boolean).length >= 25, `review${index} must be ~25 words`);
  assert.equal(source, 'written from the set');
  assert.ok(/\d/.test(rating), `review${index} needs numeric star`);
}

const violations = searchPlaceOutputViolations({
  category: 'restaurant',
  title: 'Harbor Grill',
  summary: 'Short distinct summary for why Harbor Grill fits this coastal dinner slot.',
  description: 'Long rating-driven description that names the seafood focus, sunset seating, and why the reservation tradeoff is worth planning ahead on this trip.',
  price: 85,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 20.9,
  lng: -156.5,
  sourceRecord: record,
});
assert.ok(!violations.includes('missing_sourced_reviews'), `expected reviews to pass, got ${violations.join(',')}`);
assert.ok(!violations.includes('missing_rating'), `expected rating to pass, got ${violations.join(',')}`);
assert.ok(!violations.some((row) => row.includes('ratingMix')), 'must not require star mix');

const themesOnlyViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Themes-backed store',
  summary: 'Short summary for a store whose reviews were written from fetched themes.',
  description: 'Description stays distinct from the summary and reflects the published average without a star mix.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: {
    googleRating: '4.5',
    ratingCount: 120,
    reviewThemes: [
      'Helpful staff and organized aisles',
      'Lines build up on Saturday mornings',
      'Good produce selection for tourists',
      'Prices run a little higher than chains nearby',
    ],
    review1: record.review1,
    review1Source: record.review1Source,
    review1Rating: record.review1Rating,
    review2: record.review2,
    review2Source: record.review2Source,
    review2Rating: record.review2Rating,
    review3: record.review3,
    review3Source: record.review3Source,
    review3Rating: record.review3Rating,
    review4: record.review4,
    review4Source: record.review4Source,
    review4Rating: record.review4Rating,
  },
});
assert.ok(
  !themesOnlyViolations.includes('missing_sourced_reviews'),
  'average + count + themes with four written-from-set reviews must pass without ratingMix',
);

const missingAverage = applyXaiPlaceRatingsToRecord({}, {
  google: null,
  yelp: null,
  otherSites: [],
  themes: [],
  costUsdTicks: 1000,
}, { title: 'Empty Place' });
assert.equal(missingAverage.googleRating, undefined);
assert.equal(missingAverage.xaiRatingsFetched, false);

const reviewsOnly = writeRepresentativeReviews({
  themes: ['One theme only'],
  averageRating: 4.2,
  placeName: 'Sample',
});
assert.ok(reviewsOnly.review1 && reviewsOnly.review4, 'themes cycle into four written-from-set reviews');

console.log('xai place ratings tests passed');
