#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertSearchPlaceOutputContract,
  finalizeSearchPlaces,
  searchPlaceOutputViolations,
} from '../src/vacation/search-place-output.mjs';
import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
  buildVkSearchContractSamplePlaces,
  gateBRowsForSearchPlaceOutputContract,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

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
    review2: longReview.replace('Quiet rooms', 'Prepared foods'),
    review2Source: 'Google',
    review2Rating: '4',
    review3: longReview.replace('Quiet rooms', 'Coffee counter'),
    review3Source: 'Yelp',
    review3Rating: '5',
  },
});
assert.ok(
  threeReviewViolations.includes('missing_sourced_reviews'),
  'fewer than four distinct full review texts must fail',
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

assertSearchPlaceOutputContract(buildVkSearchContractSamplePlaces());

const gateBPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, gateBPlaces);

const row608Violations = searchPlaceOutputViolations(gateBPlaces[608]);
assert.ok(row608Violations.length > 0, 'list-only row 608 must fail the VK output contract');
assert.equal(
  text(gateBPlaces[608].externalId),
  'Midtown sample hotel',
  'row 608 must not borrow The Manhattan Club externalId',
);

assertSearchPlaceOutputContract(
  gateBRowsForSearchPlaceOutputContract(GATE_B_ROWS).map((row) => gateBPlaces[row.id]),
);

console.log('vk search place output contract tests passed');

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
