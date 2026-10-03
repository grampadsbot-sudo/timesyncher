import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});
const js = renderServedTrekBundle(raw.toString('utf8'));

assert.ok(js.includes('ts-thing-media\\/'));
assert.match(js, /children:\["Logo URL"/);
assert.match(js, /children:\["Logo from media"/);
assert.doesNotMatch(js, /\["googleRating","yelpRating","thirdPartyRating"\]\.some\(k=>/);

const restaurantsAt = js.indexOf('q==="restaurants"&&');
assert.ok(restaurantsAt > 0);
const restaurantsBlock = js.slice(restaurantsAt, restaurantsAt + 900);
assert.match(restaurantsBlock, /children:"All tags"/);
assert.doesNotMatch(restaurantsBlock, /ci\.length>0&&/);

const shared = sharedTripFromIntake({
  trip: {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Neutral trip',
    destination: 'Sample coast',
    start_date: '2026-05-01',
    end_date: '2026-05-05',
  },
  things: [{
    id: 'leg-a',
    category: 'transport',
    title: 'AAA to BBB',
    description: '',
    metadata: {},
  }],
});
const place = shared.places[0];
assert.equal(place.category_name, 'Flight');

console.log('product gaps staging ok');
