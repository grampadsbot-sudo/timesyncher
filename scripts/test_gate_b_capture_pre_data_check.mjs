#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  gateBCapturePreDataCheck,
} from './ops/capture/capture-pre-data-check.mjs';

const captureSrc = readFileSync(
  fileURLToPath(new URL('./ops/capture/capture.mjs', import.meta.url)),
  'utf8',
);
assert.match(captureSrc, /assertGateBCapturePreDataCheckPayload/);
assert.match(captureSrc, /chromium\.launch/);
const preIdx = captureSrc.indexOf('assertGateBCapturePreDataCheckPayload');
const launchIdx = captureSrc.indexOf('chromium.launch');
assert.ok(preIdx > 0 && launchIdx > preIdx, 'pre-data check must run before browser launch');

const placeholderHotel = {
  places: [{
    id: 9001,
    name: 'Sample Midtown Hotel',
    category_name: 'Hotel',
    description: 'Documented NYC option (hotel)',
  }],
  thingOverrides: {
    'place:9001': { price: 200, longDetails: 'Documented NYC option (hotel)' },
  },
};
const placeholderResult = await gateBCapturePreDataCheck(placeholderHotel);
assert.equal(placeholderResult.pass, false);
assert.ok(placeholderResult.failures.some((row) => row.reason === 'hotel_description_judge'));

const goodHotel = {
  places: [{
    id: 9002,
    name: 'Sample Midtown Hotel',
    category_name: 'Hotel',
  }],
  thingOverrides: {
    'place:9002': {
      price: 200,
      longDetails: 'Sample Midtown Hotel sits near Lincoln Center with strong subway access, walkable dinner options, and a calm lobby that works well for early mornings before museum visits and evening shows across Manhattan.',
    },
  },
};
const goodResult = await gateBCapturePreDataCheck(goodHotel);
assert.equal(goodResult.pass, true, JSON.stringify(goodResult.failures));

const blankFlightPrice = {
  places: [{ id: 9003, name: 'JetBlue BOS-JFK', category_name: 'flight' }],
  thingOverrides: { 'place:9003': { price: null } },
};
const blankPriceResult = await gateBCapturePreDataCheck(blankFlightPrice);
assert.equal(blankPriceResult.pass, false);
assert.ok(blankPriceResult.failures.some((row) => row.reason === 'blank_price'));

const stagingFixturePath = fileURLToPath(new URL('./fixtures/gate-b-nyc-shared-staging.json', import.meta.url));
let stagingPayload;
try {
  stagingPayload = JSON.parse(readFileSync(stagingFixturePath, 'utf8'));
} catch {
  stagingPayload = null;
}
if (stagingPayload) {
  const stagingResult = await gateBCapturePreDataCheck(stagingPayload);
  assert.equal(stagingResult.pass, false, 'refreshed staging fixture must fail until #608 data fix');
  assert.ok(stagingResult.failures.length > 0);
  const meta = stagingPayload.trip?.metadata?.gateBNycFixturePull;
  assert.ok(meta?.sourceSha, 'fixture must record sourceSha');
  assert.ok(meta?.pulledAt, 'fixture must record pulledAt');
}

console.log('gate-b-capture-pre-data-check OK');
