#!/usr/bin/env node
import assert from 'node:assert/strict';
import { braveQueryString } from '../src/vacation/brave-place-query.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';

assert.equal(
  intakeLodgingLookupQuery('Kihei Kai Nani', 'Kihei'),
  'Kihei Kai Nani, Kihei',
);
assert.equal(
  intakeLodgingLookupQuery('Hyatt Regency Maui', 'Kaanapali'),
  'Hyatt Regency Maui, Kaanapali',
);

const center = { lat: 20.9250419, lng: -156.6899009 };
const lookupQuery = intakeLodgingLookupQuery('Hyatt Regency Maui', 'Kaanapali');
const intakeItem = {
  category: 'hotel',
  q: lookupQuery,
  target: 'Hyatt Regency Maui',
  areaHint: 'Kaanapali',
  propertyName: 'Hyatt Regency Maui',
  intakeLodgingLookup: true,
};
assert.equal(braveQueryString(intakeItem, 'Kaanapali', center), lookupQuery);
assert.equal(
  braveQueryString({
    category: 'hotel',
    q: lookupQuery,
    target: 'Hyatt Regency Maui',
  }, 'Kaanapali', center),
  'Hyatt Regency Maui near Kaanapali',
);

console.log('test_intake_brave_lodging_query: ok');
