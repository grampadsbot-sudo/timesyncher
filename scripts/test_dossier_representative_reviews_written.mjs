import assert from 'node:assert/strict';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { writeDossierReviews } from '../src/vacation/thing-dossier-fields.mjs';

const census = loadVkSearchCensusResult({ id: 602 }, { env: {} });
const dossier = vkSearchResultToDossier(census, { id: 602 });
const record = writeDossierReviews({ category: 'store' }, dossier);
assert.match(record.reviewsLabel, /^Representative reviews written from \d+ reviews$/);
for (const n of [1, 2, 3, 4]) {
  assert.ok(record[`review${n}`], `review${n} written to the card`);
  assert.equal(record[`review${n}`], dossier.reviews[n - 1].text);
  assert.ok(record[`review${n}Claims`].length > 0);
  assert.notEqual(record[`review${n}Rating`], 'undefined');
  assert.doesNotMatch(record[`review${n}`], /\bI\b|WHAT ARE YOU DOING/);
}

const unlabeled = writeDossierReviews({ category: 'store' }, { ...dossier, reviewsLabel: '' });
assert.notEqual(unlabeled.reviewsLabel, dossier.reviewsLabel);
console.log('ok representative reviews written to card');
