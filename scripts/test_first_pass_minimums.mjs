import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_FIRST_PASS_MINIMUMS,
  assertRequiredFirstPassMinimums,
  firstPassMinimums,
  firstPassMissingMinimums,
} from './vacation-public-research-worker.mjs';

assert.deepEqual(DEFAULT_FIRST_PASS_MINIMUMS, { restaurant: 15, store: 10, rest: 15 });
assert.deepEqual(firstPassMinimums({}), { restaurant: 15, store: 10, rest: 15 });
assert.deepEqual(
  firstPassMinimums({ minimums: { restaurant: 3, store: 3, rest: 3 } }, { TIMESYNCHER_PUBLIC_RESEARCH_MIN_RESTAURANTS: '1' }),
  { restaurant: 15, store: 10, rest: 15 },
);

const thin = firstPassMissingMinimums(
  Array.from({ length: 8 }, (_, index) => ({ category: 'restaurant', title: `R${index}` })),
);
assert.equal(thin.counts.restaurant, 8);
assert.equal(thin.missing.restaurant.minimum, 15);
assert.equal(thin.missing.store.minimum, 10);
assert.equal(thin.missing.rest.minimum, 15);

assert.throws(
  () => assertRequiredFirstPassMinimums([{ category: 'restaurant' }, { category: 'store' }, { category: 'activity' }]),
  /fail-closed/,
);

const filled = [
  ...Array.from({ length: 15 }, () => ({ category: 'restaurant' })),
  ...Array.from({ length: 10 }, () => ({ category: 'store' })),
  ...Array.from({ length: 15 }, () => ({ category: 'activity' })),
];
assert.equal(assertRequiredFirstPassMinimums(filled).ok, true);

const worker = await readFile(new URL('./vacation-public-research-worker.mjs', import.meta.url), 'utf8');
assert.match(worker, /restaurant: 15/);
assert.match(worker, /store: 10/);
assert.match(worker, /rest: 15/);
assert.doesNotMatch(worker, /EXISTING_ITINERARY_MIN_THINGS/);

const dispatch = await readFile(new URL('./product-gbrain-dispatch.mjs', import.meta.url), 'utf8');
assert.match(dispatch, /assertRequiredFirstPassMinimums/);
assert.doesNotMatch(dispatch, /TIMESYNCHER_ALLOW_INCOMPLETE_RESEARCH_PASS/);
assert.doesNotMatch(dispatch, /job_type\) === 'itinerary_research_update' && publicResearch/);

const sync = await readFile(new URL('./trek-vacation-sync.mjs', import.meta.url), 'utf8');
assert.match(sync, /assertRequiredFirstPassMinimums/);

console.log('first-pass per-category minimums fail-closed tests passed');
