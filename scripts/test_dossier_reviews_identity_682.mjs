#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { placeSupportsDossierReviews } from '../src/vacation/dossier-brave-queries.mjs';
import { finalizeReviewSet, extractReviewsByCode } from '../src/vacation/dossier-review-extract.mjs';
import {
  dossierReviewsNeedRebuild,
  stripDossierReviews,
} from '../src/vacation/dossier-reviews-rebuild.mjs';
import { applyDossierFields, writeDossierReviews } from '../src/vacation/thing-dossier-fields.mjs';
import { readFileSync } from 'node:fs';

function page(url, textBody) {
  const body = textBody.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

assert.equal(placeSupportsDossierReviews({ category: 'car' }), false);
assert.equal(placeSupportsDossierReviews({ category: 'flight' }), false);

const carDossier = {
  pages: [page('https://priceline.com/x', 'car rental review text here')],
  reviews: [{ text: 'Old car review quote that should be removed from served fields.', rating: 5, claims: [{ text: 'x', pages: ['p1'], supported: true }] }],
};
const stripped = stripDossierReviews(carDossier, { category: 'car', title: 'Priceline' });
assert.equal(stripped.reviews.length, 0);
const carRecord = applyDossierFields({ category: 'car', review1: 'should go' }, stripped);
assert.equal(carRecord.review1, undefined);

const blueNote = { title: 'Blue Note Jazz Club', category: 'restaurant' };
const dizzy = page('https://jazz.org/dizzys', 'Dizzy\'s Club Jazz at Lincoln Center is wonderful on Broadway.');
const good = page('https://www.bluenotejazz.net/', 'Blue Note Jazz Club guests loved the late sets and the classic jazz lineup.');
const badDossier = {
  thing: 'Blue Note Jazz Club',
  pages: [dizzy, good],
  reviews: [1, 2, 3, 4].map((i) => ({
    text: `Dizzy's Club at Lincoln Center review number ${i} with enough words to pass minimum length checks here.`,
    rating: 5,
    claims: [{ text: 'dizzy', pages: ['p1'], supported: true }],
  })),
};
assert.equal(dossierReviewsNeedRebuild(badDossier, blueNote), true);

const code = extractReviewsByCode({
  thing: 'Blue Note Jazz Club',
  pages: [dizzy, good],
  braveResults: [{ url: 'https://jazz.org/dizzys', snippets: ['Dizzy\'s Club has great views at Lincoln Center Broadway.'] }],
}, blueNote);
assert.ok(!code.some((r) => /Dizzy/i.test(r.text)));
const set = finalizeReviewSet({ thing: 'Blue Note Jazz Club', pages: [good] }, code, [], null, blueNote);
assert.ok(set.every((r) => !/Dizzy/i.test(r.text)));

const ratingsPatch = readFileSync(new URL('../src/vacation/trek-thing-detail-ratings-patch.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(ratingsPatch, /Review ",G," \("/);
assert.match(ratingsPatch, /children:\["Review ",G,/);

console.log('test_dossier_reviews_identity_682: ok');
