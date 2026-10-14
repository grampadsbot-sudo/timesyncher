#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertCrossPlaceReviewBodiesDistinct,
  assertSearchPlaceOutputContract,
  crossPlaceDuplicateReviewBodyFailures,
  finalizeSearchPlaces,
  searchPlaceOutputViolations,
  TRIP_MIN_NON_EXEMPT_THINGS,
} from '../src/vacation/search-place-output.mjs';
import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
  gateBRowsForSearchPlaceOutputContract,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { assertXaiGrokPlaceRatingsContract } from './fixtures/xai-grok-place-ratings-contract.mjs';

const GATE_B_ROWS = [
  { day: 1, time: '10:30', name: 'JetBlue LAS → JFK', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Toyota Corolla', cat: 'car', id: 609, listOnly: true },
];

const COPIED_FERRY_REVIEW = 'At all times the company staff treated him preferentially both for boarding and disembarking from the ferry, and the Battery Park security line moved steadily when we arrived early.';

const longReview = 'Quiet rooms near the subway made early mornings easier, and the front desk stored bags before check-in without extra fees or confusion about timing.';

const negativeZeroPrice = searchPlaceOutputViolations({
  category: 'store',
  title: 'Sample store',
  summary: 'Distinct short summary for the itinerary line.',
  description: 'Long rating-driven description that is not copied from the summary and names what to buy.',
  price: 0,
  logoUrl: 'https://example.com/favicon.ico',
});
assert.deepEqual(
  negativeZeroPrice.includes('banned_price_zero'),
  true,
  'price 0 must fail the VK contract validator',
);

const negativeMissing = searchPlaceOutputViolations({
  category: 'hotel',
  title: 'Sample hotel',
  summary: 'Short pick line.',
  description: '',
  price: 120,
  logoUrl: 'https://example.com/favicon.ico',
});
assert.deepEqual(
  negativeMissing.includes('blank_description'),
  true,
  'blank description must fail',
);

const provenanceBlockedViolations = searchPlaceOutputViolations({
  category: 'hotel',
  title: 'Blocked list-only hotel',
  summary: 'List-only until ccab names a real property.',
  description: 'Blocked row documents missing source evidence; do not treat provenanceBlocked as permission to omit required price, logo, rating, or review fields.',
  price: null,
  logoUrl: '',
  sourceRecord: {
    provenanceBlocker: 'no ccab capture for this display name',
    provenanceBlocked: ['price', 'logoUrl', 'googleRating', 'review1', 'review2', 'review3', 'review4'],
  },
});
assert.ok(
  provenanceBlockedViolations.includes('missing_price'),
  'provenanceBlocked must not exempt missing price',
);
assert.ok(
  provenanceBlockedViolations.includes('missing_logoUrl'),
  'provenanceBlocked must not exempt missing logo',
);
assert.ok(
  provenanceBlockedViolations.includes('missing_rating'),
  'provenanceBlocked must not exempt missing rating',
);
assert.ok(
  provenanceBlockedViolations.includes('missing_sourced_reviews'),
  'provenanceBlocked must not exempt missing reviews',
);

function fourReviewsNoUrlSourceRecord(bodyFn) {
  return {
    googleRating: '4.5',
    ratingCount: 120,
    ratingMix: { 1: 2, 2: 4, 3: 10, 4: 38, 5: 66 },
    review1: bodyFn(1),
    review1Source: 'Google',
    review1Rating: '5',
    review2: bodyFn(2),
    review2Source: 'Google',
    review2Rating: '4',
    review3: bodyFn(3),
    review3Source: 'Yelp',
    review3Rating: '5',
    review4: bodyFn(4),
    review4Source: 'TripAdvisor',
    review4Rating: '4',
  };
}

const mixNoUrlViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Mix-backed review store',
  summary: 'Short summary for a store row whose reviews have labels and stars but no URLs.',
  description: 'Stored average and rating mix back four distinct review bodies without per-review URLs on a NYC trip.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: fourReviewsNoUrlSourceRecord((slot) => reviewBody(`mix-no-url-${slot}`)),
});
assert.ok(
  !mixNoUrlViolations.includes('missing_sourced_reviews'),
  'four URL-free reviews with average, ratingCount, and ratingMix must not fail missing_sourced_reviews',
);

const highCountNoMixViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'High-count store without mix',
  summary: 'Short summary for a store row missing the 1-5 rating mix while ratingCount exceeds four.',
  description: 'Description names the store without inventing aggregate counts; reviews are present but not countable.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: {
    googleRating: '4.5',
    ratingCount: 120,
    review1: reviewBody('high-count-1'),
    review1Source: 'Google',
    review1Rating: '5',
    review2: reviewBody('high-count-2'),
    review2Source: 'Google',
    review2Rating: '4',
    review3: reviewBody('high-count-3'),
    review3Source: 'Yelp',
    review3Rating: '5',
    review4: reviewBody('high-count-4'),
    review4Source: 'TripAdvisor',
    review4Rating: '4',
  },
});
assert.ok(
  highCountNoMixViolations.includes('missing_sourced_reviews'),
  'URL-free reviews without ratingMix when ratingCount > 4 must fail missing_sourced_reviews',
);

const fewReviewNoMixViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Two-review store',
  summary: 'Short summary for a store with only two stored reviews matching ratingCount.',
  description: 'When ratingCount is two and both reviews are stored, ratingMix may be omitted under v1.5.0.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: {
    googleRating: '4.6',
    ratingCount: 2,
    review1: reviewBody('few-1'),
    review1Source: 'written from the set',
    review1Rating: '5',
    review2: reviewBody('few-2'),
    review2Source: 'Google',
    review2Rating: '4',
  },
});
assert.ok(
  !fewReviewNoMixViolations.includes('missing_sourced_reviews'),
  'ratingCount 2 with two distinct full reviews may omit ratingMix',
);

const noStarReviewViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Starless review store',
  summary: 'Short summary for a store whose long review text lacks a numeric star.',
  description: 'Description stays distinct from the summary and does not invent review stars or aggregate mix data.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: {
    ...fourReviewsNoUrlSourceRecord((slot) => reviewBody(`no-star-${slot}`)),
    review1Rating: 'five stars',
  },
});
assert.ok(
  noStarReviewViolations.includes('missing_sourced_reviews'),
  'a ~25-word review without a numeric star must fail missing_sourced_reviews',
);

const descriptionOnlyRatingViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Description-only rating store',
  summary: 'Short summary without copying the long description text.',
  description: 'Rating: 4.5 from search snippets only; no stored googleRating, ratingCount, or ratingMix fields.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
});
assert.ok(
  descriptionOnlyRatingViolations.includes('missing_rating'),
  'description text with Rating: must not satisfy missing_rating without stored numeric average',
);

const threeReviewViolations = searchPlaceOutputViolations({
  category: 'store',
  title: 'Three-review store',
  summary: 'Short summary for a store row with only three sourced reviews attached.',
  description: 'Google lists this store around 4.5/5; description stays distinct from the summary and names what to buy on a NYC trip.',
  price: 18,
  logoUrl: 'https://example.com/favicon.ico',
  lat: 40.78,
  lng: -73.98,
  sourceRecord: {
    googleRating: '4.5',
    review1: longReview,
    review1Source: 'Google',
    review1Rating: '5',
    review1Url: 'https://example.com/review/1',
    review2: longReview.replace('Quiet rooms', 'Prepared foods'),
    review2Source: 'Google',
    review2Rating: '4',
    review2Url: 'https://example.com/review/2',
    review3: longReview.replace('Quiet rooms', 'Coffee counter'),
    review3Source: 'Yelp',
    review3Rating: '5',
    review3Url: 'https://example.com/review/3',
  },
});
assert.ok(
  threeReviewViolations.includes('missing_sourced_reviews'),
  'fewer than four distinct full review texts must fail',
);

const crossPlaceDuplicates = crossPlaceDuplicateReviewBodyFailures([
  {
    category: 'restaurant',
    title: 'Place A',
    sourceRecord: {
      review1: COPIED_FERRY_REVIEW,
    },
  },
  {
    category: 'store',
    title: 'Place B',
    sourceRecord: {
      review1: COPIED_FERRY_REVIEW,
    },
  },
]);
assert.ok(
  crossPlaceDuplicates.length > 0,
  'the same normalized review body on two places must fail the cross-place check',
);
assert.throws(
  () => assertCrossPlaceReviewBodiesDistinct([
    { category: 'event', title: 'First', sourceRecord: { review1: COPIED_FERRY_REVIEW } },
    { category: 'hotel', title: 'Second', sourceRecord: { review1: COPIED_FERRY_REVIEW } },
  ]),
  /cross-place duplicate review bodies/,
  'assertCrossPlaceReviewBodiesDistinct must throw on duplicated bodies',
);

const badFinalized = finalizeSearchPlaces([{
  category: 'restaurant',
  title: 'Bad row',
  summary: 'Short summary.',
  description: 'Long enough description with price context.',
  price: 0,
  logoUrl: 'https://example.com/favicon.ico',
}]);
assert.throws(
  () => assertSearchPlaceOutputContract(badFinalized),
  /search place output contract failed/,
  'assertSearchPlaceOutputContract must reject banned zero price after enrichment',
);

const gateBPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, gateBPlaces);

const row608Violations = searchPlaceOutputViolations(gateBPlaces[608]);
assert.ok(row608Violations.length > 0, 'list-only row 608 must fail the VK output contract');
assert.equal(
  text(gateBPlaces[608].externalId),
  'Midtown sample hotel',
  'row 608 must not borrow The Manhattan Club externalId',
);

const contractGateBPlaces = gateBRowsForSearchPlaceOutputContract(GATE_B_ROWS)
  .map((row) => gateBPlaces[row.id]);
assertCrossPlaceReviewBodiesDistinct(contractGateBPlaces);

const positiveContractPlaces = contractGateBPlaces.filter(
  (place) => searchPlaceOutputViolations(place).length === 0,
);
for (const place of positiveContractPlaces) {
  for (let index = 1; index <= 4; index += 1) {
    const body = text(place.sourceRecord?.[`review${index}`] ?? place[`review${index}`]);
    assert.notEqual(
      normalizeReviewBody(body),
      normalizeReviewBody(COPIED_FERRY_REVIEW),
      'positive contract rows must not include the copied ferry review text',
    );
  }
}
// Full-trip batch assert is covered by synthetic rows below; the Gate B fixture has ~8 non-exempt Things.

for (const row of gateBRowsForSearchPlaceOutputContract(GATE_B_ROWS)) {
  if (row.cat === 'flight' || row.cat === 'car') continue;
  const violations = searchPlaceOutputViolations(gateBPlaces[row.id]);
  assert.ok(
    violations.includes('missing_sourced_reviews'),
    `row ${row.id} (${row.name}) must fail missing_sourced_reviews without countable stored reviews`,
  );
}

function reviewBody(seed) {
  return `Quiet rooms near the subway made early mornings easier for visit ${seed}, and the front desk stored bags before check-in without extra fees or confusion about timing on day ${seed}.`;
}

function syntheticCompletePlace(index, { category = 'restaurant' } = {}) {
  const body = (slot) => reviewBody(`${index}-${slot}`);
  const ratingCount = 120 + index;
  return {
    category,
    title: `Synthetic place ${index}`,
    summary: `Short distinct summary ${index} for why this ${category} fits the trip.`,
    description: `Long rating-driven description ${index} that is not copied from the summary and names what to expect at this ${category} on a NYC trip.`,
    price: 40 + index,
    logoUrl: 'https://example.com/favicon.ico',
    lat: 40.75 + index * 0.001,
    lng: -73.98,
    sourceRecord: {
      googleRating: '4.5',
      ratingCount,
      ratingMix: {
        1: 2,
        2: 4,
        3: 10,
        4: 38,
        5: ratingCount - 54,
      },
      review1: body(1),
      review1Source: 'Google',
      review1Rating: '5',
      review2: body(2),
      review2Source: 'Yelp',
      review2Rating: '4',
      review3: body(3),
      review3Source: 'TripAdvisor',
      review3Rating: '5',
      review4: body(4),
      review4Source: 'Google',
      review4Rating: '4',
    },
  };
}

function syntheticTrip(count) {
  return Array.from({ length: count }, (_, index) => syntheticCompletePlace(index + 1));
}

assert.throws(
  () => assertSearchPlaceOutputContract(syntheticTrip(TRIP_MIN_NON_EXEMPT_THINGS - 1)),
  /trip_too_few_things/,
  'fewer than 15 non-flight/hotel/car Things must fail the batch contract',
);

const fifteenComplete = syntheticTrip(15);
assert.doesNotThrow(
  () => assertSearchPlaceOutputContract(fifteenComplete),
  'fifteen fully filled non-exempt Things must pass the batch contract',
);

const flaggedMissingPrice = (index) => ({
  ...syntheticCompletePlace(index),
  price: null,
  missingFields: ['price'],
  sourceRecord: {
    ...syntheticCompletePlace(index).sourceRecord,
    price: null,
  },
});

const atTwentyPercentCap = [
  ...syntheticTrip(16),
  flaggedMissingPrice(17),
  flaggedMissingPrice(18),
  flaggedMissingPrice(19),
  flaggedMissingPrice(20),
];
assert.doesNotThrow(
  () => assertSearchPlaceOutputContract(atTwentyPercentCap),
  'exactly 20% flagged missing Things must pass the batch contract',
);

const overTwentyPercentCap = [
  ...atTwentyPercentCap,
  syntheticCompletePlace(21),
  flaggedMissingPrice(22),
];
assert.throws(
  () => assertSearchPlaceOutputContract(overTwentyPercentCap),
  /trip_too_many_missing_things/,
  'one more flagged missing Thing over the 20% cap must fail',
);

assert.throws(
  () => assertSearchPlaceOutputContract([
    ...syntheticTrip(14),
    {
      ...syntheticCompletePlace(99),
      price: null,
    },
  ]),
  /unflagged_missing_price/,
  'an unflagged missing field must fail even under the 20% cap',
);

assert.throws(
  () => assertSearchPlaceOutputContract([
    ...syntheticTrip(14),
    {
      ...syntheticCompletePlace(99),
      price: 0,
      missingFields: ['price'],
    },
  ]),
  /banned_price_zero/,
  'a banned value must fail even when listed in missingFields',
);

const flaggedMissingReviews = (index) => ({
  ...syntheticCompletePlace(index),
  sourceRecord: {
    googleRating: '4.5',
    ratingCount: 120,
  },
  missingFields: ['reviews'],
});

const flaggedEmptyReviewsTrip = [
  ...syntheticTrip(16),
  flaggedMissingReviews(17),
  flaggedMissingReviews(18),
  flaggedMissingReviews(19),
  flaggedMissingReviews(20),
];
assert.doesNotThrow(
  () => assertSearchPlaceOutputContract(flaggedEmptyReviewsTrip),
  'empty reviews listed in missingFields must flag the gap and stay within the 20% cap',
);

const sharedReview = reviewBody('shared-cross-place');
assert.throws(
  () => assertSearchPlaceOutputContract([
    ...syntheticTrip(14),
    {
      ...syntheticCompletePlace(15),
      sourceRecord: {
        ...syntheticCompletePlace(15).sourceRecord,
        review1: sharedReview,
      },
    },
    {
      ...syntheticCompletePlace(16),
      sourceRecord: {
        ...syntheticCompletePlace(16).sourceRecord,
        review1: sharedReview,
      },
    },
  ]),
  /cross-place duplicate review bodies/,
  'cross-place duplicate review bodies must fail inside assertSearchPlaceOutputContract',
);

assertXaiGrokPlaceRatingsContract(assert, searchPlaceOutputViolations);

console.log('vk search place output contract tests passed');

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeReviewBody(body) {
  return text(body).toLowerCase();
}
