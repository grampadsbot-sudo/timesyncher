import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseReviewStars, resolveDossierReviewRatings } from '../src/vacation/dossier-review-ratings.mjs';
import { rederiveReviewRatings } from './rederive_review_ratings.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { writeDossierReviews } from '../src/vacation/thing-dossier-fields.mjs';
import { stripComposedReviewFiller, reviewTextsHaveRepeatedTrailingSentence } from '../src/vacation/dossier-review-filler.mjs';

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

const unrated = structuredClone(dossier);
for (const review of unrated.reviews) review.rating = null;
delete unrated.ratingEvidence;
const ratingFallback = writeDossierReviews({ category: 'store' }, unrated);
for (const n of [1, 2, 3, 4]) {
  assert.equal(ratingFallback[`review${n}`], unrated.reviews[n - 1].text);
  assert.equal(Number(ratingFallback[`review${n}Rating`]), 4);
}
assert.ok(!ratingFallback.missingFields.includes('reviews'));
assert.ok(resolveDossierReviewRatings(unrated).reviews.every((row) => row.rating === 4));
console.log('ok null review stars backfill from saved dossier.rating');

const bare = structuredClone(unrated);
delete bare.rating;
for (const useShortcomingMissing of [false, true]) {
  const missing = writeDossierReviews({ ...record, missingFields: ['price'] }, bare, { useShortcomingMissing });
  for (const n of [1, 2, 3, 4]) {
    assert.equal(missing[`review${n}`], null);
    assert.equal(missing[`review${n}Rating`], null);
  }
  assert.ok(missing.missingFields.includes('reviews'));
  assert.ok(missing.dataShortcomings.some((row) => row.field === 'reviews'));
}

const cited = structuredClone(unrated);
const ratingText = 'Rating 4.2 out of 5 from 400 reviews.';
const page = cited.pages[0];
page.text += ` ${ratingText}`;
page.sha256 = createHash('sha256').update(page.text).digest('hex');
cited.rating = 4.2;
cited.ratingEvidence = { average: 4.2, count: 400, scaleMax: 5, quote: ratingText, url: page.url, pages: ['p1'] };
const grounded = writeDossierReviews({ category: 'store' }, cited);
for (const n of [1, 2, 3, 4]) {
  assert.equal(grounded[`review${n}`], cited.reviews[n - 1].text);
  assert.equal(Number(grounded[`review${n}Rating`]), 4);
}
assert.ok(!grounded.missingFields.includes('reviews'));
for (const mutation of [{ average: 1.1 }, { count: 999999 }, { scaleMax: 10 }, { url: 'https://absent.test/' }]) {
  const unsupported = structuredClone(cited);
  Object.assign(unsupported.ratingEvidence, mutation);
  assert.equal(writeDossierReviews({ category: 'store' }, unsupported).review1, null);
}
const tampered = structuredClone(cited);
tampered.pages[0].text += ' changed after hashing';
assert.equal(writeDossierReviews({ category: 'store' }, tampered).review1, null);

const excerptBacked = structuredClone(cited);
const excerpt = 'The smoked fish counter makes this market a rewarding stop before a picnic.';
excerptBacked.pages[0].text += ` ${excerpt}`;
excerptBacked.pages[0].sha256 = createHash('sha256').update(excerptBacked.pages[0].text).digest('hex');
excerptBacked.reviewExcerpts = [{ text: excerpt, rating: '5/5', pages: ['p1'], supported: true }];
excerptBacked.reviews[0].claims = [{ text: excerpt, pages: ['p1'], supported: true }];
assert.equal(Number(writeDossierReviews({ category: 'store' }, excerptBacked).review1Rating), 5);

for (const [raw, scale, expected] of [[4, 5, 4], ['4.4', 5, 4], ['4.7 stars', 5, 5],
  ['4/5', 5, 4], ['8.4/10', 5, 4], [8.4, 10, 4], ['9.2 out of 10', 5, 5]]) {
  assert.equal(parseReviewStars(raw, scale)?.rating, expected);
}
for (const value of [null, '', 0, 6, 11, 'unknown', true, '4/7', '4/5 trailing']) {
  assert.equal(parseReviewStars(value), null);
}
for (const [field, value] of [['Stars', 4.2], ['Rating', '4.2/5'], ['Rating', '8.4/10'], ['Score10', 8.4]]) {
  const raw = structuredClone(census);
  for (const n of [1, 2, 3, 4]) {
    for (const suffix of ['Stars', 'Rating', 'Score10']) delete raw[`review${n}${suffix}`];
    raw[`review${n}${field}`] = value;
  }
  assert.deepEqual(vkSearchResultToDossier(raw).reviews.map((row) => row.rating), [4, 4, 4, 4]);
}
const drift = structuredClone(census);
for (const n of [1, 2, 3, 4]) drift[`review${n}Stars`] = 1;
const driftDossier = vkSearchResultToDossier(drift);
assert.deepEqual(driftDossier.reviews.map((row) => row.rating), [4, 4, 4, 4]);
const driftRecord = writeDossierReviews({ category: 'store' }, driftDossier);
assert.ok([1, 2, 3, 4].every((n) => driftRecord[`review${n}`] && Number(driftRecord[`review${n}Rating`]) === 4));
const ungroundedDrift = structuredClone(unrated);
for (const review of ungroundedDrift.reviews) review.rating = 1;
const stripped = resolveDossierReviewRatings(ungroundedDrift);
assert.equal(stripped.reviews.length, 0);
assert.ok(stripped.missingFields.includes('reviews'));
assert.equal(writeDossierReviews({ category: 'store' }, stripped).review1, null);

const stale = { ...grounded, title: 'Saved market', evidenceDossier: cited, summary: 'Preserve summary', price: 18 };
for (const n of [1, 2, 3, 4]) delete stale[`review${n}Rating`];
const before = structuredClone(stale);
const repaired = rederiveReviewRatings({ thingOverrides: { 'place:1': stale } });
assert.deepEqual(stale, before);
assert.deepEqual(repaired.summary, { things: 1, filled: 1, dropped: 0, unchanged: 0, ratingsFilled: 4, reviewsDropped: 0 });
const repairedThing = repaired.output.thingOverrides['place:1'];
for (const n of [1, 2, 3, 4]) {
  assert.equal(repairedThing[`review${n}`], stale[`review${n}`]);
  assert.equal(Number(repairedThing[`review${n}Rating`]), 4);
}
assert.equal(repairedThing.summary, stale.summary);
assert.equal(repairedThing.price, stale.price);
assert.equal(rederiveReviewRatings(repaired.output).summary.unchanged, 1);
const omitted = rederiveReviewRatings([{ ...stale, evidenceDossier: bare }]);
assert.equal(omitted.summary.reviewsDropped, 4);
assert.ok(omitted.output[0].missingFields.includes('reviews'));
assert.ok(omitted.output[0].dataShortcomings.some((row) => row.field === 'reviews'));
assert.ok([1, 2, 3, 4].every((n) => omitted.output[0][`review${n}`] === null));
const mismatched = rederiveReviewRatings([{ ...stale, review1: 'Text absent from the saved dossier.' }]);
assert.equal(mismatched.output[0].review1, null);
assert.equal(mismatched.summary.reviewsDropped, 1);
const dir = mkdtempSync(join(tmpdir(), 'review-ratings-'));
const inputFile = join(dir, 'input.json');
const outputFile = join(dir, 'output.json');
writeFileSync(inputFile, JSON.stringify([stale]));
const dry = spawnSync(process.execPath, ['scripts/rederive_review_ratings.mjs', inputFile, '--dry-run'], { encoding: 'utf8' });
assert.equal(dry.status, 0, dry.stderr);
assert.equal(JSON.parse(dry.stdout).summary.ratingsFilled, 4);
assert.deepEqual(JSON.parse(readFileSync(inputFile, 'utf8')), [stale]);
const applied = spawnSync(process.execPath, ['scripts/rederive_review_ratings.mjs', inputFile, '--output', outputFile], { encoding: 'utf8' });
assert.equal(applied.status, 0, applied.stderr);
assert.equal(Number(JSON.parse(readFileSync(outputFile, 'utf8'))[0].review1Rating), 4);
console.log('ok grounded review ratings, mean drift, rating shapes and offline re-derive');



const filler = 'Guests note this theme repeatedly across the saved review evidence for this place.';
const padded = writeDossierReviews({ category: 'store' }, {
  ...dossier,
  reviews: dossier.reviews.map((r, i) => ({
    ...r,
    text: i === 0 ? `${r.text} ${filler}` : `${r.text} ${filler}`,
  })),
});
for (const n of [1, 2, 3, 4]) {
  assert.doesNotMatch(padded[`review${n}`] || '', /saved review evidence/i);
  assert.equal(padded[`review${n}`], stripComposedReviewFiller(`${dossier.reviews[n - 1].text} ${filler}`));
}
assert.ok(reviewTextsHaveRepeatedTrailingSentence([
  `Alpha. ${filler}`,
  `Beta. ${filler}`,
]));
assert.equal(reviewTextsHaveRepeatedTrailingSentence(['One unique ending here.', 'Another different ending there.']), null);
console.log('ok composed review filler stripped and repeated-trailing detected');
