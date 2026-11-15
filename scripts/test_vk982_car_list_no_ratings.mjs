#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { placeRatingEvidence } from '../src/vacation/place-rating-evidence.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { patchVk982TravelNoRating } from '../src/vacation/trek-vk-982-travel-no-rating-patch.mjs';

const hertzFixture = {
  title: 'Hertz JFK — Compact SUV',
  summary: 'Priceline renters rate Hertz Corporation 8.4 from 266 reviews with a typical wait time.',
};
assert.ok(placeRatingEvidence(hertzFixture), 'Hertz NYC fixture still carries review-score dossier text');

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstream = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const rendered = renderServedTrekBundle(upstream);
assert.match(
  rendered,
  /tsRowRating=bn\(G\)\|\|Mi\(G\)\?null:tsPrimaryPlaceStarRating\(ha\(G\)\)/,
  'car and flight list rows must skip star ratings at the source',
);
assert.match(
  rendered,
  /const tsHeadStars=bn\(Dt\)\|\|Mi\(Dt\)\?"":tsRenderStarRatingHtml\(tsPrimaryPlaceStarRating\(ha\(Dt\)\)\)/,
  'car and flight detail headers must not render stars',
);
assert.equal(patchVk982TravelNoRating(rendered), rendered, 'vk982 travel no-rating patch is idempotent');

const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'rebake required: public/assets/index-BKun7ofk.js must match renderServedTrekBundle');

const nycApi = JSON.parse(
  await readFile(new URL('./fixtures/nyc-screen-trip99-live-shared-api.json', import.meta.url), 'utf8'),
);
const hertzPlace = (nycApi.places || []).find((p) => String(p.name || '').includes('Hertz JFK'));
assert.ok(hertzPlace, 'NYC fixture includes Hertz JFK car row');
assert.equal(hertzPlace.category_name || hertzPlace.category?.name, 'Car');

console.log('test_vk982_car_list_no_ratings: ok');