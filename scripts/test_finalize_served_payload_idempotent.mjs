#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildNycCraigKimDaybydayTripPositiveV1 } from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import { gateBNycFixturePayloadSha256 } from './lib/gate-b-nyc-fixture-contract.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const once = buildNycCraigKimDaybydayTripPositiveV1();
const twice = finalizeServedSharedTripPayload(structuredClone(once));
assert.equal(
  gateBNycFixturePayloadSha256(once),
  gateBNycFixturePayloadSha256(twice),
  're-finalize must not drift Gate B NYC canonical payload hash',
);

for (const id of [602, 605, 609, 666]) {
  const place = twice.places.find((row) => row.id === id);
  const override = twice.thingOverrides[`place:${id}`] || {};
  assert.ok(text(place?.description), `place ${id} must keep served description after re-finalize`);
  assert.equal(
    text(place.description),
    text(override.description),
    `place ${id} description must match override after re-finalize`,
  );
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

console.log('finalize served payload idempotency regression passed');
