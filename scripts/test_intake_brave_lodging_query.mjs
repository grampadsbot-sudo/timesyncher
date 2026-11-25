#!/usr/bin/env node
import assert from 'node:assert/strict';
import { vkSearchQueryString } from '../src/vacation/vk-search-place-identity.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';

assert.equal(
  intakeLodgingLookupQuery('Kihei Kai Nani', 'Kihei'),
  'Kihei Kai Nani, Kihei',
);
assert.equal(
  intakeLodgingLookupQuery('Hyatt Regency Maui', 'Kaanapali'),
  'Hyatt Regency Maui, Kaanapali',
);

const lookupQuery = intakeLodgingLookupQuery('Hyatt Regency Maui', 'Kaanapali');
const intakeItem = {
  category: 'hotel',
  q: lookupQuery,
  target: 'Hyatt Regency Maui',
  areaHint: 'Kaanapali',
  propertyName: 'Hyatt Regency Maui',
  intakeLodgingLookup: true,
};
assert.equal(vkSearchQueryString(intakeItem, 'Kaanapali', 'Kaanapali'), lookupQuery);
assert.equal(
  vkSearchQueryString({
    category: 'hotel',
    q: lookupQuery,
    target: 'Hyatt Regency Maui',
    targetKind: 'named_place',
  }, 'Kaanapali, Maui County, Hawaii, United States', 'Kaanapali'),
  lookupQuery,
);

console.log('test_intake_brave_lodging_query: ok');
