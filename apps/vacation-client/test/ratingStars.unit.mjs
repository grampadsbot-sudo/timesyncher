import assert from 'node:assert/strict';

import {
  parseRatingNumber,
  primaryListRatingValue,
  ratingStarFillStates,
  ratingStarsAriaLabel,
} from '../src/lib/ratingStars.mjs';

assert.equal(parseRatingNumber(0), null);
assert.equal(parseRatingNumber(''), null);
assert.equal(parseRatingNumber('3.2'), 3.2);
assert.equal(parseRatingNumber('4.5'), 4.5);
assert.equal(parseRatingNumber('5'), 5);

assert.deepEqual(ratingStarFillStates(3.2), ['full', 'full', 'full', 'empty', 'empty']);
assert.deepEqual(ratingStarFillStates(4.5), ['full', 'full', 'full', 'full', 'half']);
assert.deepEqual(ratingStarFillStates(5), ['full', 'full', 'full', 'full', 'full']);

assert.match(ratingStarsAriaLabel(4.5), /4\.5 out of 5 stars/);
assert.match(ratingStarsAriaLabel(5), /5 out of 5 stars/);

assert.equal(primaryListRatingValue({ googleRating: '4.2', yelpRating: '3.9' }), 4.2);
assert.equal(primaryListRatingValue({ yelpRating: '3.9', rating: '4.0' }), 3.9);
assert.equal(primaryListRatingValue({ thirdPartyRating: '4.7', rating: '4.0' }), 4.7);
assert.equal(primaryListRatingValue({ rating: '4.1' }), 4.1);
assert.equal(primaryListRatingValue({}), null);

console.log('vacation-client rating stars unit checks passed');
