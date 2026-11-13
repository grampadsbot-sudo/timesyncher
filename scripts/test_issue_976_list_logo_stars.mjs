#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { LIST_ROW_RATING_CONDITIONAL } from '../src/vacation/list-row-dates.mjs';
import { placeRatingEvidence } from '../src/vacation/place-rating-evidence.mjs';
import { primaryPlaceStarRating } from '../src/vacation/star-rating-model.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { logoImgOnLoadInline } from '../src/vacation/thing-logo-fallback-url.mjs';

const hertz = {
  title: 'Hertz JFK — Compact SUV',
  summary: 'Priceline renters rate Hertz Corporation 8.4 from 266 reviews with a typical wait time.',
};
const ev = placeRatingEvidence(hertz);
assert.ok(ev && Math.abs(ev.rating - 4.2) < 0.05, 'Hertz 8.4/10 narrative maps to 4.2 stars');
assert.equal(primaryPlaceStarRating(hertz), ev.rating);

assert.match(logoImgOnLoadInline(), /getClientRects\(\)\.length/);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstream = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const rendered = renderServedTrekBundle(upstream);
assert.ok(rendered.includes(LIST_ROW_RATING_CONDITIONAL.slice(0, 48)), 'bundle must use conditional list-row stars');
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'rebake required: public/assets/index-BKun7ofk.js must match renderServedTrekBundle');

console.log('test_issue_976_list_logo_stars: ok');
