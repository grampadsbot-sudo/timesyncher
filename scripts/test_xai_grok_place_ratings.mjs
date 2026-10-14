#!/usr/bin/env node
import assert from 'node:assert/strict';

import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';
import {
  applyXaiPlaceRatingsToRecord,
  enrichPlaceRecordWithXaiRatings,
  parseXaiStructuredPayload,
  writeRepresentativeReviews,
} from '../src/vacation/xai-grok-place-ratings.mjs';

const MOCK_XAI_JSON = {
  google: { average: 4.6, reviewCount: 820, sourceUrl: 'https://example.com/google', notPublished: false },
  yelp: { average: 4.4, reviewCount: 410, sourceUrl: 'https://example.com/yelp', notPublished: false },
  otherSites: [
    { average: 4.7, reviewCount: 15309, sourceUrl: 'https://example.com/tripadvisor' },
    { average: 4.5, reviewCount: 2200, sourceUrl: 'https://example.com/opentable' },
    { average: 4.8, reviewCount: 900, sourceUrl: 'https://example.com/booking' },
  ],
  reviewThemes: {
    praise: [
      'Cocktails are balanced and the bartenders know classics without being pretentious',
      'Happy hour oysters are a strong value before the dinner rush fills the room',
      'The dining room feels lively but service stays attentive on busy nights',
      'Desserts and espresso finish the meal with the same care as the savory courses',
    ],
    complaints: ['Weekend waits can stretch when every bar seat is taken'],
  },
  websiteFlavour: 'Seasonal Italian-American plates and a deep negroni list',
};

const parsed = parseXaiStructuredPayload(JSON.stringify(MOCK_XAI_JSON));
assert.equal(parsed.google.average, 4.6);
assert.equal(parsed.otherSites.length, 3);
assert.ok(parsed.otherSites[0].sourceUrl.includes('tripadvisor'));

const record = {};
applyXaiPlaceRatingsToRecord(record, parsed);
assert.equal(record.googleRating, '4.6');
assert.equal(record.googleReviewCount, '820');
assert.match(String(record.thirdPartyRating), /4\.7/);
assert.equal(record.ratingCount, 820);
assert.equal(record.ratingMix, undefined);

writeRepresentativeReviews(record, parsed, { title: 'Sample Cocktail Bar' });
assert.match(record.review1Source, /written from the set/i);
assert.ok(String(record.review1).split(/\s+/).length >= 25);

const place = {
  category: 'restaurant',
  title: 'Sample Cocktail Bar',
  summary: 'Short summary that names why this bar fits a NYC night out.',
  description: 'Long description about the bar that stays distinct from the summary and mentions the negroni program, happy hour, and Midtown foot traffic without copying review text.',
  price: 48,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.752,
  lng: -73.977,
  sourceRecord: {
    ...record,
    xaiRatingsFetched: true,
  },
};

const violations = searchPlaceOutputViolations(place);
assert.deepEqual(violations, [], `mocked xAI place should pass contract: ${violations.join(', ')}`);

const flagged = enrichPlaceRecordWithXaiRatings(
  { review1: 'Old tavily snippet that should be cleared when xAI returns nothing useful', review1Source: 'Google', review1Rating: '5' },
  parseXaiStructuredPayload(JSON.stringify({
    google: { notPublished: true },
    yelp: { notPublished: true },
    otherSites: [],
    reviewThemes: { praise: [], complaints: [] },
    websiteFlavour: '',
  })),
  { title: 'Empty ratings place' },
);
assert.ok(flagged.missingFields.includes('ratings'));
assert.ok(flagged.missingFields.includes('reviews'));
assert.equal(flagged.review1, undefined);
assert.equal(flagged.xaiRatingsFetched, false);

console.log('xai grok place ratings tests passed');
