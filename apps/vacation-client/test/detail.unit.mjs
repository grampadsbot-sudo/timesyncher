import assert from 'node:assert/strict';

import {
  buildDetailViewModel,
  detailFieldRows,
  detailHappyHour,
  detailReviews,
} from '../src/lib/detailModel.mjs';

const reviewBody =
  'The negroni is perfectly balanced and the bartenders know their classics without leaning too sweet or bitter even when the room is packed with after-work crowds waiting for bar seats.';

const barTrip = {
  places: [{ id: 10, name: 'Sample Cocktail Bar', category_name: 'Bar' }],
  thingOverrides: {
    'place:10': {
      category: 'bar',
      address: 'Midtown, New York, NY',
      phone: '(212) 555-0101',
      hours: 'Mon–Sat 4pm–2am',
      website: 'https://example-bar.test/',
      priceLevel: '$$',
      googleRating: '4.6',
      googleReviewCount: '820',
      summary: reviewBody,
      happyHourDetails: 'Mon–Fri 4–7pm: $8 cocktails and $1 oysters.',
      itineraryNote: 'Cocktails at Sample Cocktail Bar — arrive early for bar seats.',
      review1: reviewBody,
      review1Source: 'Google',
      review1Rating: '5',
      review2: `${reviewBody} Second review with enough words to satisfy the twenty five word minimum for stored review text in detail popup tests.`,
      review2Source: 'Yelp',
      review2Rating: '4.5',
      review3: `${reviewBody} Third review with enough words to satisfy the twenty five word minimum for stored review text in detail popup tests.`,
      review3Source: 'Google',
      review3Rating: '4.8',
      review4: `${reviewBody} Fourth review with enough words to satisfy the twenty five word minimum for stored review text in detail popup tests.`,
      review4Source: 'TripAdvisor',
      review4Rating: '4.7',
      summarySourceUrls: ['https://example-bar.test/', 'https://www.nytimes.com/example-bar-review'],
    },
  },
};

const barPlace = barTrip.places[0];
const barModel = buildDetailViewModel(barPlace, barTrip);
assert.equal(barModel.reviews.length, 4);
assert.equal(barModel.fieldRows.find((row) => row.key === 'phone')?.value, '(212) 555-0101');
assert.match(barModel.happyHourDetails, /oyster/i);
assert.match(barModel.itineraryNote, /Sample Cocktail Bar/i);
assert.equal(detailHappyHour(barTrip.thingOverrides['place:10']), barModel.happyHourDetails);

const sparseTrip = {
  places: [{ id: 1, name: 'Sparse Place', category_name: 'Restaurant' }],
  thingOverrides: {
    'place:1': { category: 'restaurant', summary: 'Only summary here for the sparse restaurant detail test case.' },
  },
};
const sparseModel = buildDetailViewModel(sparseTrip.places[0], sparseTrip);
assert.equal(sparseModel.fieldRows.find((row) => row.key === 'phone'), undefined);
assert.equal(sparseModel.reviews.length, 0);

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

console.log('vacation-client detail unit checks passed');
