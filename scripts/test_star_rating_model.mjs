#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  buildStarRatingStates,
  parseStarRating,
  renderStarRatingHtml,
  roundStarRatingToHalf,
} from '../src/vacation/star-rating-model.mjs';

assert.equal(parseStarRating('0'), null);
assert.equal(parseStarRating(-2), null);
assert.equal(parseStarRating('-2'), null);
assert.equal(buildStarRatingStates(0), null);
assert.equal(roundStarRatingToHalf(3.2), 3);
assert.deepEqual(buildStarRatingStates(3.2), ['full', 'full', 'full', 'empty', 'empty']);
assert.equal(roundStarRatingToHalf(4.5), 4.5);
assert.deepEqual(buildStarRatingStates(4.5), ['full', 'full', 'full', 'full', 'half']);
assert.equal(roundStarRatingToHalf(5), 5);
assert.deepEqual(buildStarRatingStates(5), ['full', 'full', 'full', 'full', 'full']);

const html = renderStarRatingHtml(4);
assert.match(html, /ts-star-rating/);
assert.match(html, /flex-direction:row/);
assert.match(html, /flex-wrap:nowrap/);
assert.match(html, /aria-label="4 out of 5 stars"/);
assert.match(html, /fill="#f59e0b"/);
assert.doesNotMatch(html, />\s*4\s*</);
assert.equal(renderStarRatingHtml(0), '');

console.log('star rating model tests passed');
