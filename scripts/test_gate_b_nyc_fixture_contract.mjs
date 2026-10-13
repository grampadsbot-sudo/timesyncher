#!/usr/bin/env node
import assert from 'node:assert/strict';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  buildNycCraigKimDaybydayTripPositiveV1,
  NYC_POSITIVE_FIXTURE_VERSION,
} from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import {
  assessGateBNycFixtureContract,
  gateBNycFixturePayloadSha256,
  renderedPrice,
  renderedSummary,
  wordCount,
} from './lib/gate-b-nyc-fixture-contract.mjs';

const negative = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const negativeReport = assessGateBNycFixtureContract(negative, { profile: 'negative' });
assert.equal(negativeReport.pass, false, 'short-copy PR340 fixture must fail the positive contract');
assert.ok(negativeReport.violations.length >= 10, `expected many violations, got ${negativeReport.violations.length}`);

const positiveOnce = buildNycCraigKimDaybydayTripPositiveV1();
const positiveTwice = finalizeServedSharedTripPayload(structuredClone(positiveOnce));
const positiveReport = assessGateBNycFixtureContract(positiveOnce, { profile: 'positive' });
assert.equal(positiveReport.pass, true, positiveReport.violations.join('\n'));

const digestA = gateBNycFixturePayloadSha256(positiveOnce);
const digestB = gateBNycFixturePayloadSha256(positiveTwice);
assert.equal(digestA, digestB, 'candidate and base paths must hash the same finalized payload');
assert.equal(positiveOnce.trip.metadata.gateBNycFixtureVersion, NYC_POSITIVE_FIXTURE_VERSION);

for (const place of positiveOnce.places || []) {
  const summary = renderedSummary(positiveOnce, place);
  assert.ok(wordCount(summary) >= 30, `${place.name} summary must survive finalization (${wordCount(summary)} words)`);
  const price = renderedPrice(positiveOnce, place);
  assert.ok(price !== null, `${place.name} must expose a price after finalization`);
}

const car = positiveOnce.places.find((row) => row.id === 609);
assert.ok(car, 'car list row 609 must remain in fixture');
const carOverride = positiveOnce.thingOverrides['place:609'] || {};
assert.equal(carOverride.timeline, false, 'opaque car stays list-only / unselected');
assert.match(String(carOverride.pickupLocation || ''), /JFK/i);
assert.match(String(carOverride.returnLocation || ''), /JFK/i);

console.log(
  JSON.stringify({
    ok: true,
    negativeViolations: negativeReport.violations.length,
    positivePayloadSha256: digestA,
    fixtureVersion: NYC_POSITIVE_FIXTURE_VERSION,
  }),
);
