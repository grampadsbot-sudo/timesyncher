import assert from 'node:assert/strict';

import { requiredTravelBase, websiteTripBase } from '../src/vacation/web-access.mjs';
import { trekSharedApiBase } from '../src/vacation/thing-media-bind.mjs';

assert.throws(() => requiredTravelBase({}), /TIMESYNCHER_TRAVEL_BASE_URL is missing/);
assert.throws(() => trekSharedApiBase({}), /TIMESYNCHER_TRAVEL_BASE_URL is missing/);

const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://trek-preview.example.com/',
};
assert.equal(requiredTravelBase(env), 'https://trek-preview.example.com');
assert.equal(trekSharedApiBase(env), 'https://trek-preview.example.com');
assert.equal(websiteTripBase(env), 'https://vacation-staging.timesyncher.com');

const slashEnv = {
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://trek-preview.example.com',
  TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://trek-upstream.example.com/',
};
assert.equal(requiredTravelBase(slashEnv), 'https://trek-preview.example.com');
assert.equal(trekSharedApiBase(slashEnv), 'https://trek-preview.example.com');

console.log('travel base env required passed');
