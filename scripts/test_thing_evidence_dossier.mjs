#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  applyDossierFields,
  computeDossierFieldHashes,
  dossierFieldHashesStale,
  prepareDossierFindings,
} from '../src/vacation/thing-dossier-fields.mjs';
import {
  changedDossierPageUrls,
  dossierNeedsRefresh,
  dossierPagesVerified,
  mergeDossierPages,
} from '../src/vacation/thing-evidence-dossier.mjs';
import {
  loadThingEvidenceDossier,
  saveThingEvidenceDossier,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { enrichPlaceRecordWithXaiRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    async getDossier(key) {
      return rows.get(key) || null;
    },
    async putDossier(key, dossier) {
      rows.set(key, JSON.parse(JSON.stringify(dossier)));
    },
  };
}

const urlA = 'https://yelp.example/a';
const urlB = 'https://tripadvisor.example/b';
const urlC = 'https://google.example/c';
const quote = 'The house margherita arrives blistered from the wood oven every night';
const baseText = `Riverside Bistro review page. ${quote}. Published average 4.5 stars from 120 verified diner reviews.`;

const wrongHashPage = page(urlA, baseText);
wrongHashPage.sha256 = 'deadbeef';

assert.equal(dossierPagesVerified({ pages: [wrongHashPage] }), false, 'wrong page sha256 must fail verification');

const reviewBodies = Array.from({ length: 20 }, (_, index) =>
  `Review ${index + 1}: ${quote} with extra guest detail about pacing value and repeat visits this season.`);
const goodPages = [
  page(urlA, `${baseText} Menu lists happy hour oysters until six pm.`),
  page(urlB, reviewBodies.join(' ')),
  page(urlC, `${baseText} Article names the margherita as the signature pie.`),
];

const findings = {
  summary: { value: 'Wood-fired pies and a deep negroni list', claims: [{ text: 'serves wood-fired pies', pages: ['p1'], supported: true }] },
  description: {
    value: 'Riverside Bistro anchors the block with blistered Riverside Bistro pies, a deep negroni list, and happy hour oysters that regulars quote in every review thread online while the raw bar, pastry counter, and late-night espresso program keep the dining room busy from opening until close.',
    claims: [{ text: 'happy hour oysters until six', pages: ['p1'], supported: true }],
  },
  rating: { average: 4.5, count: 120, scaleMax: 5, quote: 'Average 4.5 stars from 120 verified diner reviews', url: urlA },
  knownFor: [{ item: 'margherita', claims: [{ text: 'margherita is the signature pie', pages: ['p3'], supported: true }] }],
  reviewExcerpts: reviewBodies.map((body, i) => ({ text: body, pages: [`p${(i % 3) + 1}`], supported: true })),
  reviews: [
    {
      text: 'The margherita blistered crust lived up to the signature hype, and the cocktail list stayed balanced through a busy Friday service evening while the dining room kept a steady pace.',
      rating: 5,
      claims: [{ text: 'blistered from the wood oven', pages: ['p2'], supported: true }],
      verdict: true,
    },
    {
      text: 'Host stand efficiency stayed calm during the pre-show rush, and the team kept ticket pickup moving without making the lobby feel chaotic or rushed for first-time visitors.',
      rating: 4,
      claims: [{ text: 'extra guest detail about pacing', pages: ['p2'], supported: true }],
      verdict: false,
    },
    {
      text: 'Sidewalk seating stayed comfortable even with passing traffic, and the staff checked in often enough that water refills and menu questions never had to wait long.',
      rating: 4,
      claims: [{ text: 'wood oven every night', pages: ['p2'], supported: true }],
      verdict: false,
    },
    {
      text: 'Checkout timing was predictable on a packed night, and the margherita remained the dish guests mentioned most often when comparing this room to nearby options.',
      rating: 5,
      claims: [{ text: 'repeat visits this season', pages: ['p2'], supported: true }],
      verdict: true,
    },
  ],
};

const built = prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, findings);
assert.ok(built.rating > 0, 'verified dossier must retain cited rating');
assert.equal(built.reviews.length, 4, 'builder output must keep four representative reviews');

const rejected = prepareDossierFindings(
  { thing: 'Riverside Bistro', pages: goodPages, attempts: [] },
  { summary: { value: 'Invented summary', claims: [{ text: 'invented', pages: ['p1'], supported: false }] },
    hours: { value: '9-5', claims: [{ text: 'open 9-5', pages: [], supported: true }] },
    price: { value: 20, unit: 'per person', claims: [{ text: 'twenty dollars', pages: ['p9'], supported: true }] } },
);
assert.equal(rejected.fields.summary, undefined, 'judge-unsupported summary must be omitted');
assert.equal(rejected.fields.hours, undefined, 'claim citing no page must fail');
assert.equal(rejected.fields.price, undefined, 'claim citing an unknown page must fail');

const vanguardDesc = 'Village Vanguard anchors Greenwich Village jazz with a basement listening room, long-running Monday nights, and a booking pace that rewards advance tickets while the room keeps its tight sightlines, historic set lists, and the kind of close-up acoustic mix that regulars quote in every review thread online.';
const mixedDescription = prepareDossierFindings(
  { thing: 'Village Vanguard', pages: goodPages, attempts: [] },
  {
    description: {
      value: vanguardDesc,
      claims: [
        { text: 'Cover charges typically range from $25-$50', pages: ['p3'], supported: false },
        { text: 'Monday night sets are a signature booking', pages: ['p1'], supported: true },
      ],
    },
  },
);
assert.ok(mixedDescription.fields.description, 'one unsupported description claim must not blank the field');
assert.equal(mixedDescription.fields.description.claims.length, 1);
assert.equal(mixedDescription.fields.description.claims[0].supported, true);
const appliedVanguard = applyDossierFields({}, mixedDescription);
assert.ok(appliedVanguard.description.startsWith(vanguardDesc));
const noReviews = prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, { ...findings, reviewExcerpts: [] });
assert.ok(noReviews.fields.description, 'no reviews must not fail the description');
assert.match(noReviews.fields.description.value, /\nNo reviews were found for this place\.$/);
assert.equal(built.fields.description.value.includes('No reviews were found'), false);
const unsupportedReview = JSON.parse(JSON.stringify(findings));
unsupportedReview.reviews[1].claims[0].supported = false;
const badReview = enrichPlaceRecordWithXaiRatings({}, { evidenceDossier: prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, unsupportedReview) });
assert.equal(badReview.review1, undefined, 'any unsupported review claim fails reviews');
const { judgeDossierFindings, dossierJudgePrompt } = await import('../src/vacation/xai-grok-place-ratings.mjs');
const toJudge = { summary: { value: 'x', claims: [{ text: 'a', pages: ['p1'] }, { text: 'b', pages: [] }] } };
let asked = [];
await judgeDossierFindings({ pages: goodPages }, toJudge, { judgeImpl: async (_d, items) => { asked = items; return [{ id: 'c1', supported: true }]; } });
assert.equal(asked.length, 1, 'judge is asked only about claims citing saved pages');
assert.equal(toJudge.summary.claims[0].supported, true);
assert.equal(toJudge.summary.claims[1].supported, false);

const { resolveClaimCitationPages } = await import('../src/vacation/thing-dossier-fields.mjs');
const reviewDossier = {
  pages: goodPages,
  reviewSet: [{ id: 'r1', page: 'p2', text: 'guests loved the negroni list' }, { id: 'r2', page: 'p3', text: 'slow service on saturday' }],
};
assert.deepEqual(resolveClaimCitationPages(reviewDossier, ['r1', 'r2']), ['p2', 'p3']);
assert.equal(resolveClaimCitationPages(reviewDossier, ['r9']), null);
const reviewClaimJudge = {
  description: { value: 'x', claims: [{ text: 'Guests praise the negroni program', pages: ['r1'] }] },
};
let reviewAsked = [];
await judgeDossierFindings(reviewDossier, reviewClaimJudge, {
  judgeImpl: async (_d, items) => {
    reviewAsked = items;
    return [{ id: 'c1', supported: true, reason: 'meaning supported' }];
  },
});
assert.deepEqual(reviewAsked[0].pages, ['p2'], 'review-set ids resolve to dossier page ids before the judge');
assert.equal(reviewClaimJudge.description.claims[0].supported, true);
const contradictJudge = {
  description: { value: 'x', claims: [{ text: 'The hotel has no bar', pages: ['p1'] }] },
};
await judgeDossierFindings({ pages: goodPages }, contradictJudge, {
  judgeImpl: async (_d, items) => items.map((item, index) => ({
    id: `c${index + 1}`,
    supported: false,
    reason: 'contradicts the cited page',
  })),
});
assert.equal(contradictJudge.description.claims[0].supported, false, 'contradicted claims fail the judge');
assert.match(dossierJudgePrompt({ pages: goodPages }, [{ text: 'paraphrase ok', pages: ['p1'] }]), /meaning|paraphrase/i);

const record = enrichPlaceRecordWithXaiRatings({}, { evidenceDossier: built });
assert.equal(record.xaiRatingsFetched, true, 'verified dossier must mark ratings fetched');
assert.ok(record.review1, 'representative review text must land on the record');
assert.match(String(record.reviewsLabel), /Representative review written from 20 reviews/);

const { descriptionNamesThing, MIN_REVIEWS_READ } = await import('../src/vacation/thing-dossier-fields.mjs');
assert.equal(MIN_REVIEWS_READ, 10);
assert.deepEqual(built.reviewSources.length, 3);
const narrow = JSON.parse(JSON.stringify(findings));
narrow.reviewExcerpts = narrow.reviewExcerpts.map((item) => ({ ...item, pages: ['p2'] }));
const narrowRec = enrichPlaceRecordWithXaiRatings({}, { evidenceDossier: prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, narrow) });
assert.equal(narrowRec.xaiRatingsFetched, false, 'one review source fails the breadth bar');
assert.ok(narrowRec.review1, 'limited reviews are still written');
assert.match(String(narrowRec.reviewsLabel), /^limited reviews found \(\d+\)$/);
assert.ok(narrowRec.missingFields.includes('reviews'));
assert.equal(descriptionNamesThing('The Smith Lincoln Square is a brasserie', 'The Smith - Lincoln Square'), true);
assert.equal(descriptionNamesThing("Zabar's sells lox", "Zabar's"), true);
assert.equal(descriptionNamesThing('A brasserie near the park', 'The Smith - Lincoln Square'), false);
const kf = { knownFor: [{ item: 'bar', claims: [{ text: 'p1 lists a bar', pages: ['p1'] }] }] };
let kfAsked = [];
await judgeDossierFindings({ pages: goodPages }, kf, { judgeImpl: async (_d, items) => { kfAsked = items; return []; } });
assert.equal(kfAsked[0].kind, 'knownFor', 'known-for claims go to the judge tagged for the signature test');
assert.equal(kfAsked[0].item, 'bar');

const X4 = await import('../src/vacation/dossier-review-extract.mjs');
const F4 = await import('../src/vacation/thing-dossier-fields.mjs');
const rvPage = page('https://www.reddit.com/r/nyc/x', 'thread alpha_user • 2y ago I loved the margherita here, the crust was great and we went back twice beta_user • 1y ago Honestly overpriced and the staff were rude to my friends when we visited last spring gamma_user • 3mo ago Best pizza on the block, I recommend the margherita without hesitation to anyone visiting delta • 2d ago end');
const codeSet = X4.extractReviewsByCode({ pages: [rvPage] });
assert.equal(codeSet.length, 3, 'reddit comment markers split three opinions');
const set4 = X4.finalizeReviewSet({ pages: [rvPage] }, codeSet, [
  { page: 'p1', text: 'I loved the margherita here, the crust was great and we went back twice' },
  { page: 'p1', text: 'Invented review that is not on the page at all, I loved it' },
]);
assert.equal(set4.length, 3, 'model duplicates are deduped and ungrounded model reviews dropped');
assert.equal(set4[0].source, 'reddit.com');
const tenPt = JSON.parse(JSON.stringify(findings));
tenPt.reviews.forEach((r, i) => { r.rating = [9, 8, 9, 8][i]; });
tenPt.reviews[0].claims.push({ text: 'unsupported extra', pages: ['p2'], supported: false });
const b4 = prepareDossierFindings({ thing: 'Riverside Bistro', pages: goodPages, attempts: [] }, tenPt);
assert.deepEqual(b4.reviews.map((r) => r.rating), [5, 4, 5, 4], '10-point stars convert to 1-5');
assert.equal(b4.reviews[0].droppedClaims, 1, 'only the unsupported claim is dropped');
assert.equal(b4.reviews.length, 4);
assert.equal(F4.knownForSpecific('pre-theater dining'), false);
assert.equal(F4.knownForSpecific('tableside guacamole'), true);
const long = Array.from({ length: 13 }, (_, i) => `Sentence ${i} has exactly ten words in it for this test.`).join(' ');
const fit = F4.fitDescriptionWords(long);
assert.ok(F4.fitDescriptionWords(long).split(/\s+/).length <= 120 && fit.endsWith('.'), 'trim to <=120 words at a sentence end');

const empty = enrichPlaceRecordWithXaiRatings({ review1: 'stale' }, { evidenceDossier: { thing: 'Empty', pages: [], attempts: [] } });
assert.ok(empty.missingFields.includes('reviews'));
assert.ok(empty.missingFields.includes('ratings'));
assert.equal(empty.review1, undefined);

const merged = mergeDossierPages(
  { thing: 'Riverside Bistro', pages: [goodPages[0]], attempts: [] },
  { thing: 'Riverside Bistro', pages: [goodPages[1]], attempts: [{ kind: 'page', status: 'ok' }] },
);
assert.equal(merged.pages.length, 2);
assert.deepEqual(changedDossierPageUrls([goodPages[0]], [goodPages[0], goodPages[1]]), [urlB]);

const { hashes, sources } = computeDossierFieldHashes(built);
assert.equal(hashes.description, goodPages[0].sha256);
assert.equal(sources.description, urlA);
assert.ok(goodPages.every((row) => String(hashes.reviews).includes(row.sha256)));
assert.ok(String(sources.reviews).includes(urlB));
assert.equal(dossierFieldHashesStale({ fieldHashes: hashes, fieldSources: sources }, built), false);
assert.equal(
  dossierFieldHashesStale({ fieldHashes: hashes, fieldSources: sources }, {
    ...built,
    pages: goodPages.map((row, index) => (index === 0 ? page(urlA, 'changed text breaks hash dependency') : row)),
  }),
  true,
);

assert.equal(dossierNeedsRefresh({ pages: goodPages }, 60_000, Date.now() + 120_000), true, 'max-age must expire dossier');

useThingEvidenceDossierStore(memoryStore());
await saveThingEvidenceDossier('test:roundtrip', built);
const loaded = await loadThingEvidenceDossier('test:roundtrip');
assert.equal(loaded.thing, 'Riverside Bistro');
assert.equal(loaded.pages.length, 3);
useThingEvidenceDossierStore(null);

console.log('test_thing_evidence_dossier: ok');
