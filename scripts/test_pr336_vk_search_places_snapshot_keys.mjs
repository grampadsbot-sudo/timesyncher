#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkVkContract, reviewTexts } from './vk_contract_check_local.mjs';
import { refreshSnapshotFromSharedTrip, refreshSnapshotFromDossiers } from './regenerate_pr336_vk_snapshot_from_fixture_rows.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildPr336GateBRegenerateRows,
  buildPr336VkSearchPlacesByRowId,
  pr336SnapshotRowIdKey,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const badSnapshotKeys = Object.keys(snapshot).filter((key) => {
  try {
    pr336SnapshotRowIdKey(key);
    return false;
  } catch {
    return true;
  }
});
assert.equal(badSnapshotKeys.length, 0, `invalid pr336 snapshot keys: ${badSnapshotKeys.join(', ')}`);

const built = buildPr336VkSearchPlacesByRowId(buildPr336GateBRegenerateRows());
const badBuiltKeys = Object.keys(built).filter((key) => {
  try {
    pr336SnapshotRowIdKey(key);
    return false;
  } catch {
    return true;
  }
});
assert.equal(badBuiltKeys.length, 0, `invalid generated snapshot keys: ${badBuiltKeys.join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  snapshotRows: Object.keys(snapshot).length,
  builtRows: Object.keys(built).length,
}, null, 2));

const contractPlace = {
  title: 'Evidence Bistro', category: 'restaurant',
  summary: 'Pasta by the park.', description: 'Evidence Bistro serves pasta beside the park with outdoor tables.',
  price: 35, logoUrl: 'https://evidence.example/logo.png', lat: 40.77, lng: -73.98,
};
const checked = (patch) => checkVkContract({ a: { ...contractPlace, ...patch } });
for (const category of ['hotel', 'restaurant', 'store', 'event']) {
  assert.deepEqual(checked({ category }).failing, { [`ratings/${category}`]: 1, [`reviews/${category}`]: 1 });
  assert.equal(checked({ category, rating: 4.7, review1: 'Attentive service and excellent pasta.' }).ok, true);
  assert.equal(checked({ category, sourceRecord: { googleRating: '4.7', reviews: [{ text: 'Excellent pasta.' }] } }).ok, true);
  for (const reviewsNote of ['No reviews found.', 'No reviews were found for this place.', 'A limited number of reviews were found.', 'limited reviews found (2)']) {
    assert.equal(checked({ category, ratingsNote: 'No ratings found in saved dossier.', reviewsNote }).ok, true);
  }
  assert.equal(checked({ category, sourceRecord: { ratingsNote: 'Ratings not found.', reviewsNote: 'No reviews available.' } }).ok, true);
  assert.equal(checked({ category, dataShortcomings: [{ field: 'ratings', reason: 'No ratings found.' }, { field: 'reviews', reason: 'Limited number of reviews found.' }] }).ok, true);
}
for (const note of ['', '  ', true, { text: 'No reviews found.' }, 'look later', 'not checked', 'unavailable']) {
  const result = checked({ ratingsNote: note, reviewsNote: note });
  assert.equal(result.failing['ratings/restaurant'], 1);
  assert.equal(result.failing['reviews/restaurant'], 1);
}
assert.equal(checked({ ratingsNote: 'No reviews found.', reviewsNote: 'No ratings found.' }).ok, false);
assert.equal(checked({ dataShortcomings: [{ field: 'address', reason: 'No reviews found. No ratings found.' }] }).ok, false);
assert.equal(checked({ description: 'No reviews found. No ratings found.' }).ok, false);
assert.equal(checked({ rating: 4.5, reviews: [{ text: '' }, { text: null }] }).failing['reviews/restaurant'], 1);
assert.deepEqual(reviewTexts({ review1: ' Good pasta. ', sourceRecord: { review2: 'Good pasta.', reviews: ['Good pasta.', { text: 'Friendly staff.' }] } }), ['Good pasta.', 'Friendly staff.']);
const notedPlace = { ...contractPlace, ratingsNote: 'No ratings found.', reviewsNote: 'No reviews found.' };
for (const [field, patch] of [
  ['summary', { summary: '' }], ['description', { description: '' }],
  ['price', { price: null }], ['logoUrl', { logoUrl: '' }],
  ['coordinates', { lat: null }], ['identity', { sourceIdentityMismatch: true }],
  ['summary', { summary: 'TBD' }], ['summary', { summary: contractPlace.description }],
]) assert.equal(checkVkContract({ a: { ...notedPlace, ...patch } }).failing[`${field}/restaurant`], 1);
assert.equal(checkVkContract({ a: notedPlace, b: notedPlace }).failing['description-duplicate/restaurant'], 2);
assert.equal(checkVkContract({ a: { ...notedPlace, category: 'unknown' } }).failing['category/unknown'], 1);
assert.equal(checkVkContract({}).failing['payload/empty'], 1);
const capRows = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index, { ...notedPlace, description: `Distinct narrative ${index} about the bistro.`, ...(index === 0 ? { missingFields: ['price'], price: null } : {}) }]));
assert.equal(checkVkContract(capRows).ok, true);
capRows[1].missingFields = ['logoUrl'];
capRows[1].logoUrl = '';
assert.equal(checkVkContract(capRows).failing['flagged/over-cap'], 1);

const quotedReview = 'The pasta was excellent and the terrace was peaceful.';
const dossierBody = `Evidence Bistro. ${quotedReview}`;
const dossier = {
  key: 'shared:restaurant:evidence-bistro', thing: contractPlace.title,
  pages: [{ url: 'https://evidence.example/reviews', text: dossierBody, fetchedAt: '2026-10-27T23:00:00Z', sha256: createHash('sha256').update(dossierBody).digest('hex') }],
  googleRating: '4.7', googleReviewCount: '23',
  fields: {}, reviews: [{ text: quotedReview, claims: [{ text: quotedReview, supported: true, pages: ['p1'] }] }],
};
const originalRows = { 1: { ...contractPlace, externalId: contractPlace.title, sourceRecord: { price: 35, logoUrl: contractPlace.logoUrl } }, 2: { title: 'An airline', category: 'flight', price: 250 } };
const shared = {
  places: [{ id: 1, name: contractPlace.title }],
  thingOverrides: { 'place:1': { evidenceDossier: dossier, googleRating: '5.0', googleReviewCount: '999', review1: quotedReview, review1Url: dossier.pages[0].url, reviewsLabel: 'Representative review from saved evidence' } },
};
const refreshed = refreshSnapshotFromSharedTrip(originalRows, shared);
assert.equal(refreshed[1].sourceRecord.googleRating, '4.7');
assert.equal(refreshed[1].sourceRecord.review1, quotedReview);
assert.match(refreshed[1].sourceRecord.reviewsNote, /Limited number of reviews/);
assert.match(refreshed[1].sourceRecord.reviewsLabel, /Representative/);
assert.deepEqual(refreshed[1].sourceRecord.ratingReviewEvidence.pageUrls, [dossier.pages[0].url]);
for (const key of Object.keys(contractPlace)) assert.deepEqual(refreshed[1][key], originalRows[1][key]);
assert.deepEqual(refreshed[2], originalRows[2]);
assert.equal(originalRows[1].sourceRecord.review1, undefined);
assert.deepEqual(refreshSnapshotFromSharedTrip(refreshed, shared), refreshed);
const noReviewsDossier = { ...dossier, googleRating: null, googleReviewCount: null, reviews: [] };
const empty = refreshSnapshotFromDossiers(originalRows, [noReviewsDossier]);
assert.match(empty[1].sourceRecord.ratingsNote, /No ratings found/);
assert.match(empty[1].sourceRecord.reviewsNote, /No reviews found/);
const thirdParty = refreshSnapshotFromDossiers(originalRows, [{ ...noReviewsDossier, otherRatingSites: [{ name: 'Booking', average: 8.7, count: 23, url: dossier.pages[0].url }] }]);
assert.equal(thirdParty[1].sourceRecord.thirdPartyRating, '8.7');
assert.equal(thirdParty[1].sourceRecord.thirdPartyReviewCount, '23');
assert.equal(thirdParty[1].sourceRecord.ratingsNote, undefined);
const few = refreshSnapshotFromDossiers(originalRows, [{ ...dossier, reviews: [{ text: quotedReview, claims: [{ text: quotedReview, supported: true, pages: ['p1'] }] }] }]);
assert.equal(few[1].sourceRecord.reviews[0].text, quotedReview);
assert.equal(few[1].sourceRecord.review1, quotedReview);
assert.equal(few[1].sourceRecord.review1Rating, undefined);
assert.match(few[1].sourceRecord.reviewsNote, /Limited number of reviews/);
const activityRows = { 1: { ...originalRows[1], category: 'activity' } };
for (const result of [refreshSnapshotFromSharedTrip(activityRows, shared), refreshSnapshotFromDossiers(activityRows, [dossier])]) {
  assert.equal(result[1].category, 'activity');
  assert.equal(result[1].sourceRecord.googleRating, '4.7');
  assert.equal(result[1].sourceRecord.review1, quotedReview);
}
const reviewsShortcoming = { field: 'reviews', reason: 'representative reviews could not be verified from saved evidence' };
const ratingsShortcoming = { field: 'ratings', reason: 'required field still missing after evidence pass', attempts: [] };
const shortcomings = [reviewsShortcoming, ratingsShortcoming];
const missingDossier = { ...noReviewsDossier, reviewsRead: 35, shortcomings };
const missingShared = { ...shared, thingOverrides: { 'place:1': { evidenceDossier: { ...missingDossier, shortcomings: [] }, dataShortcomings: shortcomings } } };
const missingRows = { 1: { ...originalRows[1], sourceRecord: { ...originalRows[1].sourceRecord, dataShortcomings: [{ field: 'hours', reason: 'Hours vary.' }, ratingsShortcoming] } } };
for (const result of [refreshSnapshotFromDossiers(missingRows, [missingDossier]), refreshSnapshotFromSharedTrip(missingRows, missingShared), refreshSnapshotFromDossiers(missingRows, [{ ...missingDossier, shortcomings: [], dataShortcomings: shortcomings }])]) {
  const src = result[1].sourceRecord;
  assert.equal(src.reviewsNote, `No reviews found in saved dossier: ${reviewsShortcoming.reason} (35 reviews read).`);
  assert.equal(src.ratingsNote, `No ratings found in saved dossier: ${ratingsShortcoming.reason} (35 reviews read).`);
  assert.equal(src.reviewsRead, 35);
  assert.deepEqual(src.dataShortcomings, [...missingRows[1].sourceRecord.dataShortcomings, reviewsShortcoming]);
  assert.deepEqual(reviewTexts(result[1]), []);
  for (const key of ['googleRating', 'googleReviewCount', 'thirdPartyRating', 'rating', 'review1', 'review1Rating']) assert.equal(src[key], undefined);
  assert.equal(checkVkContract(result).ok, true);
  assert.deepEqual(refreshSnapshotFromDossiers(result, [missingDossier]), result);
}
const limited = refreshSnapshotFromDossiers(originalRows, [{ ...dossier, reviewsRead: 35, shortcomings: [reviewsShortcoming] }])[1].sourceRecord;
assert.equal(limited.reviewsNote, `Limited number of reviews found in saved dossier (1): ${reviewsShortcoming.reason} (35 reviews read).`);
const zeroRead = refreshSnapshotFromDossiers(originalRows, [{ ...noReviewsDossier, reviewsRead: 0, shortcomings }])[1].sourceRecord;
assert.match(zeroRead.reviewsNote, /\(0 reviews read\)/);
const unknownRead = refreshSnapshotFromDossiers(refreshed, [{ ...noReviewsDossier, shortcomings }])[1].sourceRecord;
assert.equal(unknownRead.reviewsRead, undefined);
assert.doesNotMatch(unknownRead.reviewsNote, /reviews read/);
assert.deepEqual(reviewTexts(unknownRead), []);
assert.equal(unknownRead.googleRating, undefined);
assert.equal(originalRows[1].sourceRecord.dataShortcomings, undefined);
assert.throws(() => refreshSnapshotFromDossiers(originalRows, [{ ...dossier, pages: [] }]), /no saved dossier pages/);
assert.throws(() => refreshSnapshotFromDossiers(originalRows, []), /expected one bound dossier/);
assert.throws(() => refreshSnapshotFromDossiers(originalRows, [dossier, dossier]), /expected one bound dossier/);
assert.throws(() => refreshSnapshotFromSharedTrip(originalRows, { ...shared, places: [{ id: 1, name: 'Another Bistro' }] }), /identity mismatch/);
assert.throws(() => refreshSnapshotFromSharedTrip(originalRows, { ...shared, thingOverrides: { 'place:1': { evidenceDossier: { ...dossier, thing: 'Another Bistro' } } } }), /dossier identity mismatch/);
console.log('fixture refresh and rating/review evidence-note contract tests passed');
