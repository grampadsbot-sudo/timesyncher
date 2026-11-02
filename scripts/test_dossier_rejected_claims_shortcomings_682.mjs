#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { syncDossierRequiredShortcomings } from '../src/vacation/dossier-evidence-hydrate.mjs';
import {
  dossierReviewsPassValidityGate,
  dossierReviewsShouldRunWriter,
  rebuildDossierReviewsFromSavedEvidence,
  stampReviewsEvidencePageHash,
  stripDossierReviews,
} from '../src/vacation/dossier-reviews-rebuild.mjs';
import {
  mergeSelectiveDossierFindings,
  prepareDossierFindings,
} from '../src/vacation/thing-dossier-fields.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';

const VERIFIED = 'representative reviews could not be verified from saved evidence';

function page(url, textBody) {
  const text = textBody.trim();
  return {
    url,
    fetchedAt: '2026-01-15T00:00:00.000Z',
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

function claim(text, pageId = 'p1') {
  return { text, pages: [pageId], supported: true };
}

const place = {
  title: 'Harbor Grill',
  category: 'restaurant',
  website: 'https://harborgrill.example/',
};
const pages = [
  page('https://harborgrill.example/about', 'Harbor Grill serves grilled fish and keeps a patio open on Friday nights for guests.'),
  page('https://forum.example/harbor', 'Harbor Grill guests mention the patio and the grilled fish in recent visits.'),
  page('https://guide.example/harbor', 'Harbor Grill is a waterfront grill with evening seating and a short menu.'),
];

function supportedReview(text, rating, pageId = 'p1') {
  return { text, rating, verdict: rating >= 4, claims: [claim(text.slice(0, 80), pageId)] };
}

const validReviews = [
  supportedReview('Harbor Grill guests liked the late seating and the grilled fish on Friday night.', 5),
  supportedReview('Harbor Grill patio seating was tight but the fish arrived hot and well seasoned.', 4, 'p2'),
  supportedReview('Harbor Grill staff kept water filled while the grilled fish course took a while.', 4, 'p3'),
  supportedReview('Harbor Grill evening seating worked once the party arrived before the patio filled.', 3),
];

const captured = {
  thing: 'Harbor Grill',
  pages,
  reviewsRead: 32,
  reviewSources: ['harborgrill.example', 'forum.example', 'guide.example'],
  fieldCounts: { reviews: { count: 32, status: 'ok', sources: 3 } },
  shortcomings: [],
};

const prepared = prepareDossierFindings(captured, {
  reviews: [
    validReviews[0],
    validReviews[1],
    {
      text: 'Harbor Grill seating feels cramped once the patio fills for the late seating.',
      rating: 3,
      verdict: false,
      claims: [{ text: 'seating feels cramped', pages: ['p1'], supported: false }],
    },
    {
      text: 'Harbor Grill guests still praise the historic room and the grilled fish plates.',
      rating: 4,
      verdict: true,
      claims: [],
    },
  ],
});
const preparedEmpty = prepared.reviews.filter((row) => !row.claims?.length);
assert.equal(prepared.reviews.length, 4);
assert.equal(preparedEmpty.length, 2);

const merged = mergeSelectiveDossierFindings(
  { ...captured, reviews: [], reviewsEvidencePageHash: 'stale-success' },
  prepared,
  new Set(['reviews']),
  place,
);
assert.equal(merged.reviews.length, 2);
assert.ok(merged.reviews.every((row) => row.claims?.length && row.claims.every((item) => item.supported === true)));
assert.equal(merged.reviews.some((row) => preparedEmpty.some((empty) => empty.text === row.text)), false);
assert.equal(merged.reviewsEvidencePageHash, undefined);
assert.equal(dossierReviewsPassValidityGate(merged, place), false);
assert.equal(merged.reviewsRead, 32);
assert.equal(merged.shortcomings.find((row) => row.field === 'reviews')?.reason, VERIFIED);
assert.equal(dossierReviewsShouldRunWriter({ pages, reviews: [] }, merged, place), true);
const probeReason = { field: 'reviews', attempts: [], reason: VERIFIED };
const probed = syncDossierRequiredShortcomings({
  ...merged,
  shortcomings: [...(merged.shortcomings || []).filter((row) => row.field !== 'reviews'), probeReason],
}, place);
assert.equal(dossierReviewsPassValidityGate(probed, place), false);
assert.equal(probed.shortcomings.find((row) => row.field === 'reviews')?.reason, VERIFIED);
assert.equal(probed.reviewsEvidencePageHash, undefined);
assert.ok(probed.missingFields.includes('reviews'));
assert.equal(dossierReviewsShouldRunWriter(probed, probed, place), true);
const probedChanged = {
  ...probed,
  pages: probed.pages.map((row, index) => (index === 0
    ? page(row.url, `${row.text} Additional saved evidence.`)
    : row)),
};
assert.equal(dossierReviewsShouldRunWriter(probed, probedChanged, place), true);

const previousFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('network forbidden');
};
let generationCalls = 0;
try {
  const retried = await rebuildDossierReviewsFromSavedEvidence(merged, place, {
    topUpImpl: async (dossier) => dossier,
    extractDossierReviews: async () => {
      generationCalls += 1;
      return { set: [], stats: {} };
    },
    callDossierBuilder: async () => {
      generationCalls += 1;
      return { findings: { reviews: [] } };
    },
    judgeDossierFindings: async () => {
      generationCalls += 1;
    },
  });
  assert.equal(generationCalls, 3);
  assert.equal(dossierReviewsPassValidityGate(retried, place), false);
  assert.equal(retried.reviewsEvidencePageHash, undefined);
  assert.equal(retried.shortcomings.find((row) => row.field === 'reviews')?.reason, VERIFIED);
  const evidenceChanged = {
    ...merged,
    pages: merged.pages.map((row, index) => (index === 0
      ? page(row.url, `${row.text} Additional saved evidence.`)
      : row)),
  };
  assert.equal(dossierReviewsPassValidityGate(evidenceChanged, place), false);
  assert.equal(dossierReviewsShouldRunWriter(merged, evidenceChanged, place), true);
} finally {
  globalThis.fetch = previousFetch;
}

const legacyOne = {
  ...captured,
  reviews: [validReviews[0]],
  reviewsRead: 32,
  shortcomings: [{ field: 'reviews', attempts: [{ query: 'harbor grill reviews' }], reason: 'limited number of reviews' }],
};
assert.equal(dossierReviewsPassValidityGate(legacyOne, place), false);
assert.equal(dossierReviewsShouldRunWriter(legacyOne, legacyOne, place), false);
const legacySynced = syncDossierRequiredShortcomings(legacyOne, place);
assert.equal(legacySynced.shortcomings.some((row) => /could not be verified/i.test(String(row.reason || ''))), false);
assert.equal(dossierReviewsShouldRunWriter(legacySynced, legacySynced, place), false);
let legacyCalls = 0;
const legacyResult = await rebuildDossierReviewsFromSavedEvidence(legacyOne, place, {
  topUpImpl: async (dossier) => dossier,
  extractDossierReviews: async () => {
    legacyCalls += 1;
    return { set: [], stats: {} };
  },
  callDossierBuilder: async () => {
    legacyCalls += 1;
    return { findings: { reviews: [] } };
  },
  judgeDossierFindings: async () => {
    legacyCalls += 1;
  },
});
assert.equal(legacyCalls, 0);
assert.equal(legacyResult.reviews.length, 1);
assert.equal(legacyResult.reviews[0].text, validReviews[0].text);

const rejectedDirect = mergeSelectiveDossierFindings(
  { ...captured, reviews: [] },
  {
    ...prepared,
    reviews: [
      validReviews[0],
      { ...validReviews[1], claims: [] },
      { ...validReviews[2], claims: [{ text: 'no', pages: ['p9'], supported: true }] },
      { ...validReviews[3], claims: [{ text: 'no', pages: ['p1'], supported: false }] },
    ],
  },
  new Set(['reviews']),
  place,
);
assert.equal(rejectedDirect.reviews.length, 1);
assert.equal(rejectedDirect.reviews[0].text, validReviews[0].text);

const invalidRepresentative = [1, 2, 3, 4].map((n) => ({
  text: `Maple Bistro review ${n} says the room is rude, crowded, and not worth a quiet dinner nearby.`,
  rating: 2,
  verdict: false,
  claims: [claim('the room is rude and crowded')],
}));
const explicit = {
  field: 'reviews',
  attempts: [{ query: 'harbor grill reviews' }],
  reason: VERIFIED,
};
const invalidDossier = {
  ...captured,
  reviews: invalidRepresentative,
  shortcomings: [explicit],
  reviewsEvidencePageHash: 'stale-success',
};
const beforeSync = JSON.stringify(invalidDossier);
const breadth = computeDossierFieldCounts(invalidDossier, place);
assert.equal(breadth.reviews.status, 'ok');
assert.equal(breadth.reviews.count, 32);
assert.equal(breadth.reviews.sources, 3);
assert.equal(dossierReviewsPassValidityGate(invalidDossier, place), false);
const synced = syncDossierRequiredShortcomings(invalidDossier, place);
assert.equal(JSON.stringify(invalidDossier), beforeSync);
const kept = synced.shortcomings.find((row) => row.field === 'reviews');
assert.equal(kept?.reason, VERIFIED);
assert.equal(kept.attempts.length, 1);
assert.equal(synced.fieldCounts.reviews.status, 'ok');
assert.equal(synced.fieldCounts.reviews.count, 32);
assert.equal(synced.fieldCounts.reviews.sources, 3);
assert.ok(synced.missingFields.includes('reviews'));
assert.equal(synced.reviewsEvidencePageHash, undefined);
assert.equal(dossierReviewsShouldRunWriter({ pages, reviews: [] }, synced, place), true);
assert.equal(dossierReviewsShouldRunWriter(synced, synced, place), true);

const valid = stampReviewsEvidencePageHash({
  ...captured,
  reviews: validReviews,
  shortcomings: [],
}, place);
assert.equal(dossierReviewsPassValidityGate(valid, place), true);
assert.equal(dossierReviewsShouldRunWriter(valid, valid, place), false);
let writerCalls = 0;
const noop = await rebuildDossierReviewsFromSavedEvidence(valid, place, {
  extractDossierReviews: async () => {
    writerCalls += 1;
    return { set: [], stats: {} };
  },
  callDossierBuilder: async () => {
    writerCalls += 1;
    return { findings: {} };
  },
  judgeDossierFindings: async () => {
    writerCalls += 1;
  },
});
assert.equal(writerCalls, 0);
assert.equal(noop.reviewsEvidencePageHash, valid.reviewsEvidencePageHash);
const cleared = syncDossierRequiredShortcomings({
  ...valid,
  shortcomings: [{ field: 'reviews', attempts: [], reason: VERIFIED }],
}, place);
assert.equal(cleared.shortcomings.some((row) => row.field === 'reviews'), false);

const changedPages = valid.pages.map((row) => page(row.url, `${row.text} Maple Bistro is the quieter room.`));
const changed = {
  ...valid,
  pages: changedPages,
  reviewsEvidencePageHash: valid.reviewsEvidencePageHash,
};
assert.equal(dossierReviewsPassValidityGate(changed, place), false);
assert.equal(dossierReviewsShouldRunWriter(valid, changed, place), true);
const unstamped = stampReviewsEvidencePageHash({ ...changed }, place);
assert.equal(unstamped.reviewsEvidencePageHash, undefined);

for (const category of ['flight', 'car']) {
  const unsupported = { title: 'Sample hop', category };
  const dossier = {
    ...captured,
    reviews: validReviews,
    shortcomings: [{ field: 'reviews', attempts: [{ query: 'sample' }], reason: VERIFIED }],
  };
  const out = syncDossierRequiredShortcomings(dossier, unsupported);
  assert.equal(out.shortcomings.some((row) => row.field === 'reviews'), false);
  assert.equal(dossierReviewsShouldRunWriter(dossier, { ...dossier, pages: changedPages }, unsupported), false);
  assert.equal(stripDossierReviews(dossier, unsupported).reviews.length, 0);
  assert.equal(dossierReviewsPassValidityGate(dossier, unsupported), true);
}

console.log('test_dossier_rejected_claims_shortcomings_682: ok');
