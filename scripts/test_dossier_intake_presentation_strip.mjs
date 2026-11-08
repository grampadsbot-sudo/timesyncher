#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyDossierFields } from '../src/vacation/thing-dossier-fields.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import {
  containsIntakePresentationStub,
  isStructuredFlightNarrative,
  stripIntakePresentationFragments,
} from '../src/vacation/dossier-intake-presentation-strip.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const amelieStub =
  'West Village French bistro with strong wine list; reservations recommended on Friday nights. Price: $65 dinner prix fixe floor; Status: candidate only.';
const amelieClean = stripIntakePresentationFragments(amelieStub, { category: 'restaurant' });
assert.ok(!containsIntakePresentationStub(amelieClean), 'restaurant stub stripped');
assert.match(amelieClean, /French bistro/i);
assert.doesNotMatch(amelieClean, /candidate only/i);

const summaryStub = 'West Village French bistro; Price: $65 prix fixe floor.';
assert.equal(
  stripIntakePresentationFragments(summaryStub, { category: 'restaurant' }),
  'West Village French bistro',
);

const flightLedger =
  'Airline: Delta; Route: LAS-JFK; Stops: nonstop; Price: $257 Main Basic / $367 Main Classic; Status: candidate only; not booked.';
const flightClean = stripIntakePresentationFragments(flightLedger, { category: 'flight' });
assert.doesNotMatch(flightClean, /candidate only/i);
assert.match(flightClean, /\$257 Main Basic/);
assert.ok(isStructuredFlightNarrative(flightClean));
assert.ok(isStructuredFlightNarrative(flightLedger));

const place = {
  title: "Amelie Bistro & Wine Bar",
  category: 'restaurant',
  sourceRecord: {
    category: 'restaurant',
    details: amelieStub,
    longDetails: amelieStub,
    summary: summaryStub,
  },
  website: 'https://www.ameliewinebar.com/',
};
const page = { url: 'https://www.ameliewinebar.com/', text: 'Amelie wine bar Amsterdam Avenue' };
const dossier = normalizeDossierEvidence({ thing: place.title, pages: [page], fields: {} }, place);
const stubBody = `${'Fixture restaurant copy with enough words to pass narrative fallback gates for offline tests only. '.repeat(3)}Price: $65 prix fixe floor; Status: candidate only.`;
function verifiedPage(url, body) {
  const row = body.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: row,
    sha256: createHash('sha256').update(row).digest('hex'),
  };
}
const applied = applyDossierFields(
  { category: 'restaurant', title: place.title },
  {
    thing: place.title,
    pages: [verifiedPage('https://www.ameliewinebar.com/', 'Amelie wine bar on Amsterdam Avenue')],
    fields: {
      description: {
        value: stubBody,
        claims: [{ text: 'Amelie wine bar', pages: ['p1'], supported: true }],
      },
    },
  },
);
assert.match(text(applied.description || ''), /candidate only/i);
const hydrated = normalizeDossierEvidence(
  { thing: place.title, pages: [page], fields: {} },
  place,
);
assert.doesNotMatch(text(hydrated.fields.description?.value || ''), /candidate only/i);
assert.doesNotMatch(text(hydrated.fields.summary?.value || ''), /prix fixe floor/i);

console.log('dossier intake presentation strip tests passed');
