#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { placeRatingEvidence } from '../src/vacation/place-rating-evidence.mjs';
import { primaryPlaceStarRating } from '../src/vacation/star-rating-model.mjs';
import { applyLiveQa903Presentation, citedShowsRatingFromNarrative } from '../src/vacation/live-qa-903-presentation.mjs';
import fixture from './fixtures/issue-961-star-evidence-things.json' with { type: 'json' };

const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const start = bundle.indexOf('tsParseStarRating=raw=>');
const end = bundle.indexOf(',tsThingReviewLines=', start);
assert.ok(start >= 0 && end > start, 'served bundle star helpers missing');
const served = new Function(`let tsParseStarRating,tsRoundStarRatingHalf,tsStarRatingStates,tsStarRatingAria,tsStarPath,tsStarSvg,tsRenderStarRatingHtml,tsPrimaryPlaceRatingEvidence,tsPrimaryPlaceStarRating;${bundle.slice(start, end)};return tsPrimaryPlaceStarRating;`)();

const thing = (id) => fixture.thingOverrides[`place:${id}`];
const both = (override, label) => {
  const model = primaryPlaceStarRating(override);
  assert.equal(served(override), model, `${label}: served bundle and model disagree`);
  return model;
};

const mustShow = [
  [680, 4.5, 'Piccola Cucina: Summary names Restaurantji 4.5 over OpenTable 4.8 in details'],
  [695, 4.3, 'Cafe Luxembourg: stored thirdPartyRating with missingFields ratings'],
  [685, 4.6, 'Carmine\'s: "OpenTable diners rate it 4.6"'],
  [620, 3.9, 'Hotel Edison: cited dossier rating'],
  [629, 4.5, 'Romer: cited dossier rating'],
  [611, 4.4, 'Blue Note place:611: stored thirdPartyRating with missingFields ratings'],
  [681, 4.2, 'Milos: Summary Restaurantji clause survives a search-snapshot clause'],
];
for (const [id, want, label] of mustShow) {
  assert.ok(thing(id).missingFields.includes('ratings') || id === 620 || id === 629, `${label}: fixture shape`);
  assert.equal(both(thing(id), label), want, label);
}

const mustHide = [
  [678, 'Ray\'s: no rating anywhere'],
  [674, 'Rosa Mexicano: only search-snapshot and unnamed OpenTable lines'],
  [612, 'Chelsea Market: "shows 2,638 reviews" is a count, not 2 stars'],
  [606, 'composed matinee must not borrow stars'],
  [607, 'composed meetup must not borrow search-snapshot park stars'],
  [682, 'John\'s: Tripadvisor 4.4 comes only from a search snapshot'],
];
for (const [id, label] of mustHide) assert.equal(both(thing(id), label), null, label);

assert.equal(thing(612).thirdPartyRating, '2');
assert.match(thing(612).description, /shows 2,638 reviews/);
assert.equal(both(thing(617), 'Arthouse'), 4.2, 'Arthouse: Booking.com 7.9/10 is not a 1-5 overall; cited Tripadvisor 4.2 wins');

const edison = placeRatingEvidence(thing(620));
assert.deepEqual([edison.rating, edison.count, edison.origin], [3.9, 18818, 'evidenceDossier']);
const romer = placeRatingEvidence(thing(629));
assert.deepEqual([romer.rating, romer.count, romer.origin], [4.5, 615, 'evidenceDossier']);
const piccola = placeRatingEvidence(thing(680));
assert.deepEqual([piccola.rating, piccola.count, piccola.source], [4.5, 1138, 'Restaurantji']);

for (const key of ['googleRating', 'yelpRating', 'thirdPartyRating', 'rating']) {
  assert.equal(both({ missingFields: ['ratings'], [key]: '4.1' }, `(a) ${key}`), 4.1, `(a) ${key} must not be hidden by missingFields ratings`);
}

const pageOnly = {
  title: 'Sample Osteria',
  missingFields: ['ratings'],
  summary: 'A neighborhood trattoria.',
  evidenceDossier: { pages: [{ url: 'https://www.restaurantji.com/xx/sample-osteria/', text: 'Sample Osteria reviews | Restaurantji listing | 4.4 312 ratings … great pasta' }] },
};
assert.equal(both(pageOnly, '(c) stored Restaurantji line'), 4.4);
assert.equal(both({ ...pageOnly, evidenceDossier: { pages: [{ ...pageOnly.evidenceDossier.pages[0], text: 'Other Place reviews | Restaurantji listing | 4.4 312 ratings' }] } }, '(c) untied page'), null);
assert.equal(both({ summary: 'OpenTable diners rate it 4.7 from 1,204 reviews.' }, '(c) rate it'), 4.7);
assert.equal(both({ summary: 'Restaurantji diners rate it 4.5 from 1138 ratings.', thirdPartyRating: '4.0', thirdPartySource: 'Yelp' }, '(c) summary source preferred'), 4.5);

for (const text of ['Its Yelp page shows 2,638 reviews and 7,240 photos.', 'The listing shows 3 reviews so far.', 'Its page shows 1,476 ratings.']) {
  assert.equal(both({ description: text }, `(d) ${text}`), null, `(d) ${text}`);
  assert.equal(both({ description: text, missingFields: ['ratings'], thirdPartyRating: text.match(/\d/)[0] }, `(d) stored ${text}`), null, `(d) stored count head ${text}`);
  assert.equal(citedShowsRatingFromNarrative(text), null, `(d) serve ${text}`);
}
assert.equal(citedShowsRatingFromNarrative('Restaurantji shows 4.3 from 1186 ratings.')?.value, 4.3);
const served903 = applyLiveQa903Presentation({ places: [{ id: 1 }], thingOverrides: { 'place:1': { missingFields: ['ratings'], description: 'Its Yelp page shows 2,638 reviews.', thirdPartyRating: '2' } } });
assert.equal(served903.thingOverrides['place:1'].thirdPartyRating, undefined, '(d) serve must not write 2 from a comma-grouped count');

const reviewsOnly = { missingFields: ['ratings'], review1Rating: '5', review2Rating: '4', review3Rating: '4', review4Rating: '5', summary: 'Guests love it.' };
assert.equal(both(reviewsOnly, '(e) reviews only'), null, '(e) review1-4 must never be averaged into an overall');

assert.match(bundle, /"data-rental-company":Mi\(G\)\?String\(ha\(G\)\.rentalCompany\|\|""\)\.trim\(\):"","data-ts-thing-key":Qt\(G\)/);
assert.match(bundle, /"data-ts-detail-title-wrap":"1","data-ts-detail-thing-key":Qt\(Dt\)/);

console.log('test_issue_961_overall_star_evidence: ok');
