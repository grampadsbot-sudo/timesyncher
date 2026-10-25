#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  applyDossierFields,
  formatPublishedRating,
  prepareDossierFindings,
  ratingClaimSupported,
} from '../src/vacation/thing-dossier-fields.mjs';

function page(url, text) {
  const body = String(text).trim();
  return {
    url,
    fetchedAt: '2026-10-24T12:00:00.000Z',
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const trustUrl = 'https://www.trustindex.io/reviews/www.bluenotejazz.com';
const pageText = [
  'Blue Note Jazz Club guest feedback on Trustindex.',
  'Overall score 4.2 out of 5 stars from 5,747 verified reviews.',
  'Shows nightly sets in Greenwich Village.',
].join(' ');

const dossier = {
  thing: 'Blue Note Jazz Club',
  pages: [page(trustUrl, pageText)],
  attempts: [],
};

const writerQuote = 'Blue Note rating: 4.2| 5747 total';
const findings = {
  rating: {
    average: 4.2,
    count: 5747,
    scaleMax: 5,
    quote: writerQuote,
    url: trustUrl,
  },
};

assert.equal(formatPublishedRating(4.2), '4.2');
assert.equal(formatPublishedRating(4.200000000000001), '4.2');
assert.ok(!/4\. 2/.test(formatPublishedRating(4.2)));

assert.equal(ratingClaimSupported(dossier, findings.rating), true, 'numeric claim support without contiguous writer quote');
assert.equal(
  normIncludesContiguousQuote(dossier, writerQuote),
  false,
  'writer quote must stay noncontiguous on saved page (obsolete gate)',
);

const prepared = prepareDossierFindings(dossier, findings);
assert.equal(prepared.rating, 4.2);
assert.ok(prepared.ratingEvidence);

const applied = applyDossierFields({ category: 'music' }, prepared);
assert.equal(applied.thirdPartyRating, '4.2');
assert.equal(applied.thirdPartyReviewCount, '5747');
assert.ok(!/4\. 2/.test(String(applied.thirdPartyRating)));

const publicApplyAgain = applyDossierFields({ title: 'Blue Note Jazz Club', category: 'music' }, prepared);
assert.equal(publicApplyAgain.thirdPartyRating, '4.2');
assert.ok(!/4\. 2/.test(String(publicApplyAgain.thirdPartyRating)));

console.log('matrix R2 ratings claim-support round-trip passed');

function normIncludesContiguousQuote(dossier, quote) {
  const needle = String(quote || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return dossier.pages.some((row) => String(row.text || '').replace(/\s+/g, ' ').trim().toLowerCase().includes(needle));
}
