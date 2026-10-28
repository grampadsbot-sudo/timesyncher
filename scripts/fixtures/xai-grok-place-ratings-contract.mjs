import { createHash } from 'node:crypto';

import {
  applyXaiPlaceRatingsToRecord,
  enrichPlaceRecordWithXaiRatings,
  parseXaiStructuredPayload,
  writeRepresentativeReviews,
} from '../../src/vacation/xai-grok-place-ratings.mjs';
import { prepareDossierFindings } from '../../src/vacation/thing-dossier-fields.mjs';

export function vkContractText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeVkContractReviewBody(body) {
  return vkContractText(body).toLowerCase();
}

function dossierPage(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

function verifiedDossierFixture() {
  const urlA = 'https://official.example/harbor-lantern';
  const urlB = 'https://reviews.example/harbor-lantern';
  const urlC = 'https://article.example/harbor-lantern';
  const quote = 'Guests praise the blistered margherita and balanced negroni list nightly';
  const reviewBodies = Array.from({ length: 20 }, (_, index) =>
    `Review ${index + 1}: ${quote} with extra guest detail about pacing value and repeat visits this season.`);
  const pages = [
    dossierPage(urlA, `Harbor Lantern Bar site. ${quote}. Average 4.6 from 820 published reviews. Entrees from 48 per person. ${reviewBodies.slice(0, 7).join(' ')}`),
    dossierPage(urlB, reviewBodies.slice(7, 14).join(' ')),
    dossierPage(urlC, `Article calls the margherita the signature cocktail-bar pie. ${reviewBodies.slice(14).join(' ')}`),
  ];
  return prepareDossierFindings({ thing: 'Harbor Lantern Bar', pages, attempts: [] }, {
    summary: { value: 'Balanced cocktails and blistered pies', claims: [{ text: 'balanced negroni list', pages: ['p1'], supported: true }] },
    description: {
      value: 'Harbor Lantern Bar pairs a deep negroni program with wood-fired pies, and Harbor Lantern Bar regulars cite the blistered margherita and happy-hour value in long-form reviews across the saved pages while the raw bar, dessert counter, and late espresso service keep the room full from open to close.',
      claims: [{ text: 'blistered margherita', pages: ['p1'], supported: true }],
    },
    price: { value: 48, unit: 'per person', claims: [{ text: 'entrees from 48 per person', pages: ['p1'], supported: true }] },
    rating: {
      average: 4.6,
      count: 820,
      scaleMax: 5,
      quote: 'Average 4.6 from 820 published reviews',
      url: urlA,
      starMix: [328, 164, 82, 164, 82],
    },
    knownFor: [{ item: 'margherita', claims: [{ text: 'margherita the signature', pages: ['p3'], supported: true }] }],
    reviewExcerpts: reviewBodies.map((body, index) => ({ text: body, pages: [index < 7 ? 'p1' : index < 14 ? 'p2' : 'p3'], supported: true })),
    reviews: [
      {
        text: 'The margherita crust and negroni balance justified the hype, and the margherita stayed consistent across two visits this month while the room kept its energy without feeling rushed.',
        rating: 5,
        claims: [{ text: 'blistered margherita', pages: ['p1'], supported: true }],
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
        claims: [{ text: 'repeat visits this season', pages: ['p2'], supported: true }],
        verdict: false,
      },
      {
        text: 'Checkout timing was predictable on a packed night, and the margherita remained the dish guests mentioned most often when comparing this room to nearby options.',
        rating: 5,
        claims: [{ text: 'balanced negroni list', pages: ['p3'], supported: true }],
        verdict: true,
      },
    ],
  });
}

export function assertXaiGrokPlaceRatingsContract(assert, searchPlaceOutputViolations) {
  const parsedXai = parseXaiStructuredPayload(JSON.stringify({
    google: { average: 4.6, reviewCount: 820, sourceUrl: 'https://example.com/google', notPublished: false },
    yelp: { average: 4.4, reviewCount: 410, sourceUrl: 'https://example.com/yelp', notPublished: false },
    otherSites: [{ average: 4.7, reviewCount: 15309, sourceUrl: 'https://example.com/tripadvisor' }],
    reviewThemes: { praise: ['Cocktails are balanced'], complaints: [] },
    websiteFlavour: 'Seasonal Italian-American plates',
  }));
  assert.equal(parsedXai.google.average, 4.6);
  const xaiRecord = {};
  applyXaiPlaceRatingsToRecord(xaiRecord, parsedXai);
  assert.equal(xaiRecord.googleRating, '4.6');

  const dossier = verifiedDossierFixture();
  const dossierRecord = enrichPlaceRecordWithXaiRatings({}, { evidenceDossier: dossier });
  writeRepresentativeReviews(dossierRecord, { evidenceDossier: dossier });
  assert.equal(dossierRecord.review1Source, undefined);
  assert.ok(String(dossierRecord.review1).split(/\s+/).length >= 12);
  assert.match(String(dossierRecord.reviewsLabel), /Representative review written from 20 reviews/);
  assert.equal(dossierRecord.xaiRatingsFetched, true);
  assert.equal(dossierRecord.missingFields.includes('reviews'), false);
  for (let i = 1; i <= 4; i += 1) {
    assert.equal(dossierRecord[`review${i}Claims`].length, 1);
    assert.ok(dossierRecord[`review${i}Claims`].every((claim) => claim.supported && claim.pages.length));
  }
  const xaiPlace = {
    category: 'restaurant',
    title: 'Harbor Lantern Bar',
    summary: dossierRecord.summary,
    description: dossierRecord.longDetails || dossierRecord.description,
    price: dossierRecord.price,
    logoUrl: 'https://example.com/favicon.ico',
    lat: 40.752,
    lng: -73.977,
    sourceRecord: { ...dossierRecord, xaiRatingsFetched: true },
  };
  const xaiViolations = searchPlaceOutputViolations(xaiPlace);
  assert.deepEqual(xaiViolations, [], `verified dossier place should pass contract: ${xaiViolations.join(', ')}`);

  const flaggedXai = enrichPlaceRecordWithXaiRatings(
    { review1: 'Old tavily snippet that should be cleared when xAI returns nothing useful', review1Source: 'Google', review1Rating: '5' },
    { evidenceDossier: { thing: 'Empty ratings place', pages: [], attempts: [] } },
  );
  assert.ok(flaggedXai.missingFields.includes('ratings'));
  assert.ok(flaggedXai.missingFields.includes('reviews'));
  assert.equal(flaggedXai.review1, null);
  assert.equal(flaggedXai.googleRating, undefined);
  assert.equal(flaggedXai.xaiRatingsFetched, false);

  const sparseThemes = enrichPlaceRecordWithXaiRatings(
    {},
    { evidenceDossier: { thing: 'Sparse themes place', pages: [dossierPage('https://example.com/x', 'rating only page without breadth')], attempts: [] } },
  );
  assert.ok(sparseThemes.missingFields.includes('reviews'));
  assert.equal(sparseThemes.review1, null);
  assert.equal(sparseThemes.xaiRatingsFetched, false);

  const tenPoint = parseXaiStructuredPayload(JSON.stringify({
    google: { notPublished: true },
    yelp: { notPublished: true },
    otherSites: [{ average: 8.6, reviewCount: 500, sourceUrl: 'https://example.com/booking' }],
    reviewThemes: { praise: [], complaints: [] },
    websiteFlavour: '',
  }));
  assert.equal(tenPoint.otherSites[0].average, 4.3);
}
