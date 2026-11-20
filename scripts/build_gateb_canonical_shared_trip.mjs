#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { buildGateBApprovedSharedTripWithStore } from './fixtures/gate-b-approved-shared-trip.mjs';
import { projectServedBoundaryLogosForHttp } from '../src/vacation/shared-trip-served-page.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/build_gateb_canonical_shared_trip.mjs <out.json>');
  process.exit(2);
}

const doc = projectServedBoundaryLogosForHttp(
  await buildGateBApprovedSharedTripWithStore({ env: process.env }),
);
writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
