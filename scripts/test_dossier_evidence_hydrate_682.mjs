#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { requiresHappyHourCapture } from '../src/vacation/dossier-brave-queries.mjs';
import {
  addressIsSpecific,
  evidencePageMatchesPlace,
  hydrateScalarFieldsFromEvidence,
  normalizeDossierEvidence,
  stripMisattributedDossierFields,
} from '../src/vacation/dossier-evidence-hydrate.mjs';
import { applyDossierFields } from '../src/vacation/thing-dossier-fields.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';

function text(v) {
  return String(v ?? '').trim();
}

function page(url, textBody) {
  const body = textBody.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

assert.equal(addressIsSpecific('Upper West Side'), false);
assert.equal(addressIsSpecific('131 W 3rd St, New York, NY 10012'), true);

const blueNote = { title: 'Blue Note Jazz Club', category: 'restaurant', website: 'https://www.bluenotejazz.net/' };
const dizzyPage = page('https://jazz.org/dizzys', 'Dizzy\'s Club at Jazz at Lincoln Center on Broadway at 60th Street. Hours 5pm-11pm.');
assert.equal(evidencePageMatchesPlace(dizzyPage, blueNote, { thing: blueNote.title }), false);

let dossier = {
  thing: 'Blue Note Jazz Club',
  pages: [dizzyPage, page('https://www.bluenotejazz.net/', 'Blue Note Jazz Club at 131 W 3rd St phone 212-475-8592')],
  fields: {
    address: { value: 'Broadway at 60th', claims: [{ text: 'Broadway', pages: ['p1'], supported: true }] },
    website: { value: 'https://jazz.org/dizzys', claims: [{ text: 'jazz.org', pages: ['p1'], supported: true }] },
  },
  shortcomings: [],
};
dossier = stripMisattributedDossierFields(dossier, blueNote);
assert.equal(dossier.fields.address, undefined);
assert.equal(dossier.fields.website, undefined);

const phonePlace = { title: 'Carbone', category: 'restaurant' };
const withPhone = hydrateScalarFieldsFromEvidence({
  thing: 'Carbone',
  pages: [page('https://carbone.com/', 'Carbone restaurant phone 212-254-3000 reservations')],
  fields: {},
}, phonePlace);
assert.match(String(withPhone.fields.phone?.value || ''), /212-254-3000/);

const reviewsDossier = {
  thing: 'X',
  pages: [page('https://example.com', 'review '.repeat(40))],
  reviews: [1, 2, 3, 4].map((i) => ({ text: `Review quote number ${i} with enough words to count as a real review line here.`, rating: 5 })),
  fields: { summary: { value: 'Sample Bistro is a cozy spot in the village with pasta and wine for groups and dates alike.' } },
  shortcomings: [],
};
const reviewCounts = computeDossierFieldCounts(reviewsDossier, { title: 'Sample Bistro', category: 'restaurant' });
assert.equal(reviewCounts.reviews.status, 'ok');
const applied = applyDossierFields({}, { ...reviewsDossier, shortcomings: [] });
assert.equal(applied.missingFields.includes('reviews'), false);

assert.equal(requiresHappyHourCapture({ title: 'Blue Note Jazz Club', category: 'restaurant' }), false);
assert.equal(requiresHappyHourCapture({ title: 'Corner Bar', category: 'bar' }), true);

const flightCounts = computeDossierFieldCounts({ pages: [page('https://aa.com', 'flight')], fields: {} }, { title: 'Flight LAS-JFK', category: 'flight' });
assert.equal(flightCounts.hours.status, 'ok');
assert.equal(flightCounts.happyHour, undefined);

const flightPlace = {
  title: 'Flight option: American LAS-JFK',
  category: 'flight',
  sourceRecord: {
    summary: 'Airline: American; Route: LAS-JFK;',
    longDetails: 'Airline: American; Route: LAS-JFK; Outbound: 2026-06-23 12:37-20:59;',
  },
};
const seeded = normalizeDossierEvidence({ pages: [page('https://aa.com', 'booking')], fields: {} }, flightPlace);
assert.ok(text(seeded.fields.description?.value).includes('LAS-JFK'));

console.log('test_dossier_evidence_hydrate_682: ok');
