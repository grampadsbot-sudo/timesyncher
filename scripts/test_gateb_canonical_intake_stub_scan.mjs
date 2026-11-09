#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildGateBApprovedSharedTrip } from './fixtures/gate-b-approved-shared-trip.mjs';
import { scanIntakePresentationStubs } from '../src/vacation/dossier-intake-presentation-strip.mjs';

const trip = buildGateBApprovedSharedTrip();
const report = scanIntakePresentationStubs(trip, { includeMatches: true });
assert.equal(
  report.pass,
  true,
  `buildGateBApprovedSharedTrip intake stub scan must be clean (got ${report.matchCount}: ${JSON.stringify(report.matches?.slice(0, 3))})`,
);
console.log('gate-b canonical intake stub scan passed');
