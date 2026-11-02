#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { buildGateBApprovedSharedTripWithStore } from './fixtures/gate-b-approved-shared-trip.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';
import {
  tripPlaceDossierKey,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const store = {
  rows: new Map(),
  async getDossier(key) {
    return this.rows.get(key) || null;
  },
  async putDossier(key, dossier) {
    this.rows.set(key, JSON.parse(JSON.stringify(dossier)));
  },
};

const dossierKey = tripPlaceDossierKey(99, 610);
const dossier = {
  thing: 'Carbone',
  pages: [page('https://example.com/carbone', 'Carbone hours Mon-Fri 5pm-11pm phone 212-555-0100')],
  attempts: [],
  fields: {
    itineraryNote: {
      value: 'Carbone — book the earliest table; spicy rigatoni is the move.',
      claims: [{ text: 'spicy rigatoni', pages: ['p1'], supported: true }],
    },
    hours: { value: 'Mon-Fri 5pm-11pm', claims: [{ text: 'Mon-Fri 5pm', pages: ['p1'], supported: true }] },
    phone: { value: '212-555-0100', claims: [{ text: '212-555-0100', pages: ['p1'], supported: true }] },
  },
  reviews: [],
  reviewsRead: 12,
  rating: 4.5,
  reviewsAvailable: 100,
};
await store.putDossier(dossierKey, dossier);
useThingEvidenceDossierStore(store);

const trip = await buildGateBApprovedSharedTripWithStore({ env: {}, storeImpl: store });
const override = trip.thingOverrides?.['place:610'] || {};
assert.match(String(override.itineraryNote || ''), /Carbone/i);
assert.match(String(override.phone || ''), /212-555-0100/);
assert.match(String(override.hours || ''), /5pm/i);

let body = null;
const res = {
  statusCode: 0,
  setHeader() {},
  end(payload) {
    body = JSON.parse(String(payload));
  },
};
await sharedTripHandler({
  method: 'GET',
  url: `/api/shared/${GATE_B_APPROVED_SHARED_SLUG}/?trekPath=${GATE_B_APPROVED_SHARED_SLUG}`,
  headers: {},
}, res);
assert.equal(res.statusCode, 200);
const served = body.thingOverrides?.['place:610'] || {};
assert.match(String(served.itineraryNote || ''), /rigatoni/i);

console.log('test_gate_b_fixture_trip_dossier_overlay: ok');
