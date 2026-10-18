import assert from 'node:assert/strict';

import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import {
  REPRESENTATIVE_REVIEWS_FOOTNOTE,
  buildDetailViewModel,
  detailCoordinates,
  detailFieldRows,
  detailHappyHour,
  detailRatingLines,
  detailReviewTotalsLine,
  detailReviews,
  detailSummary,
  safeHttpUrl,
} from '../src/lib/detailModel.mjs';
import { buildEnrichedDetailSharedTrip } from './fixtures/enriched-detail-shared-trip.mjs';

function wordCount(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

assert.equal(safeHttpUrl('https://example.com/path'), 'https://example.com/path');
assert.equal(safeHttpUrl('javascript:alert(1)'), null);
assert.equal(safeHttpUrl('example.com'), null);

const enrichedTrip = finalizeServedSharedTripPayload(buildEnrichedDetailSharedTrip());
const restaurant = enrichedTrip.places.find((place) => /Harbor Room/i.test(place.name || ''));
assert.ok(restaurant, 'enriched restaurant');
const restaurantOverride = enrichedTrip.thingOverrides[`place:${restaurant.id}`];
const restaurantModel = buildDetailViewModel(restaurant, enrichedTrip);

assert.ok(detailCoordinates(restaurant, enrichedTrip), 'coordinates resolve from enriched place');
assert.ok(
  restaurantModel.fieldRows.some((row) => row.key === 'coordinates'),
  'pure field probe includes coordinates',
);
assert.equal(restaurantModel.reviews.length, 4);
assert.ok(
  restaurantModel.reviews.every((review) => review.source),
  'review sources remain on the detail model for legacy enriched rows',
);
assert.equal(restaurantModel.reviewFootnote, '');
assert.match(restaurantModel.reviewTotalsLine, /Based on 820 reviews, avg 4\.6 \(other ratings\)/i);
assert.match(restaurantModel.headerLabel, /Restaurant · Brave/i);
assert.ok(wordCount(restaurantModel.summary) >= 30);
assert.match(restaurantModel.happyHourDetails, /oyster/i);
assert.match(restaurantModel.itineraryNote, /Harbor Room/i);
assert.equal(restaurantModel.summarySourceUrls.length, 2);
assert.equal(detailHappyHour(restaurantOverride), restaurantModel.happyHourDetails);
assert.equal(detailReviewTotalsLine(restaurantOverride), restaurantModel.reviewTotalsLine);

assert.deepEqual(detailRatingLines(restaurantOverride), [
  { id: 'google', text: '4.6 on Google (820 reviews)' },
  { id: 'yelp', text: '4.4 on Yelp (410 reviews)' },
  { id: 'third', text: 'Other ratings: 4.6' },
]);
assert.deepEqual(
  detailRatingLines({
    thirdPartyRating: '4.7',
    thirdPartyReviewCount: '15,309',
    source: 'Tripadvisor',
  }),
  [{ id: 'third', text: 'Other ratings: 4.7 (15,309 reviews)' }],
);
assert.deepEqual(
  detailRatingLines({
    googleRating: '4.6',
    googleReviewCount: '820',
    yelpRating: '4.4',
    yelpReviewCount: '410',
    thirdPartyRating: '4.7',
    thirdPartyReviewCount: '15,309',
    source: 'Tripadvisor',
  }),
  [
    { id: 'google', text: '4.6 on Google (820 reviews)' },
    { id: 'yelp', text: '4.4 on Yelp (410 reviews)' },
    { id: 'third', text: 'Other ratings: 4.7 (15,309 reviews)' },
  ],
);
assert.equal(
  detailReviewTotalsLine({
    review_totals: { count: 15309, average: 4.7, sources: ['Tripadvisor'] },
  }),
  'Based on 15309 reviews, avg 4.7 (other ratings)',
);

const bar = enrichedTrip.places.find((place) => /Copper Lantern/i.test(place.name || ''));
const barModel = buildDetailViewModel(bar, enrichedTrip);
assert.ok(barModel.reviews.some((review) => /Composite of 120 Google\/Yelp reviews/i.test(review.compositeLabel || '')));

const xaiReviewBody =
  'Representative review themes mention fresh ingredients, attentive staff, and a lively room even when the waitlist runs long on weekend nights downtown.';
const xaiTrip = {
  places: [{ id: 3, name: 'xAI Place', category_name: 'Restaurant', lat: 40.73, lng: -74.0 }],
  thingOverrides: {
    'place:3': {
      category: 'restaurant',
      xaiRatingsFetched: true,
      review1: xaiReviewBody,
      review1Source: 'TripAdvisor',
      review1Rating: '4.6',
    },
  },
};
const xaiModel = buildDetailViewModel(xaiTrip.places[0], xaiTrip);
assert.equal(xaiModel.reviews.length, 1);
assert.equal(xaiModel.reviews[0].source, 'TripAdvisor');
assert.equal(xaiModel.reviewFootnote, REPRESENTATIVE_REVIEWS_FOOTNOTE);

const sparseTrip = {
  places: [{ id: 1, name: 'Sparse Place', category_name: 'Restaurant', lat: 40.73, lng: -74.0 }],
  thingOverrides: {
    'place:1': {
      category: 'restaurant',
      summary: 'Only summary here for the sparse restaurant detail test case.',
      review1: 'Too short',
      review1Source: 'Google',
      review1Rating: '5',
    },
  },
};
const sparseModel = buildDetailViewModel(sparseTrip.places[0], sparseTrip);
assert.equal(sparseModel.fieldRows.find((row) => row.key === 'phone'), undefined);
assert.equal(sparseModel.reviews.length, 0);
assert.equal(sparseModel.summary, '');
assert.equal(detailSummary(sparseTrip.places[0], sparseTrip), '');

const flightTrip = {
  places: [{ id: 2, name: 'JetBlue BOS → JFK', category_name: 'Flight' }],
  thingOverrides: {
    'place:2': {
      category: 'flight',
      price: 248,
      fareDirection: 'one-way',
      airline: 'JetBlue',
      flightNumber: 'B6123',
      departureTime: '6:30 am',
      arrivalTime: '10:15 am',
      duration: '3h 45m',
    },
  },
};
const flightRows = detailFieldRows(flightTrip.places[0], flightTrip);
assert.ok(flightRows.some((row) => row.key === 'airline'));
assert.equal(detailReviews(flightTrip.thingOverrides['place:2'], 'flight').length, 0);
assert.equal(buildDetailViewModel(flightTrip.places[0], flightTrip).priceLabel, '$248 one-way');

assert.equal(sparseModel.descriptionMissing, true);
assert.equal(sparseModel.reviewsMissing, true);
assert.equal(restaurantModel.descriptionMissing, false);
assert.equal(restaurantModel.reviewsMissing, false);
assert.equal(buildDetailViewModel(flightTrip.places[0], flightTrip).reviewsMissing, false,
  'review requirements do not apply to flights');
const fetchedDetailTrip = { thingOverrides: { 'place:1': {
  category: 'restaurant', websiteFlavour: 'The wood-fired oven faces an open kitchen.',
  reviewThemes: { praise: ['Diners praise the seasonal flatbreads'], complaints: ['Service slows on weekends'] },
  googleRating: '4.5', googleReviewCount: '1,200',
} } };
const fetchedDetail = buildDetailViewModel(sparseTrip.places[0], fetchedDetailTrip);
assert.equal(fetchedDetail.summary,
  'The wood-fired oven faces an open kitchen. Diners praise the seasonal flatbreads. Service slows on weekends.');
assert.equal(fetchedDetail.descriptionMissing, false, 'sourced short text is not padded');
assert.equal(fetchedDetail.reviewsMissing, false, 'a sourced average and count can provide review data');
assert.equal(buildDetailViewModel(sparseTrip.places[0], { thingOverrides: { 'place:1': {
  category: 'restaurant', googleRating: '4.5',
} } }).reviewsMissing, true, 'a rating without a count remains incomplete');
assert.deepEqual(detailRatingLines({ otherRatingSites: [{ rating: '4.7' }] }),
  [{ id: 'third', text: 'Other ratings: 4.7' }], 'an absent review count cannot become zero');
assert.equal(detailSummary(sparseTrip.places[0], { thingOverrides: { 'place:1': {
  longDetails: 'Book ahead on weekends; arrive early for will-call or bar seating. Compare ticket tiers and fees on the official listing before committing to a date and an arrival time for your evening.',
} } }), '', 'category sales copy is not a sourced description');

console.log('vacation-client detail unit checks passed');
