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
  const urlA = 'https://example.com/official';
  const urlB = 'https://example.com/reviews';
  const urlC = 'https://example.com/article';
  const quote = 'Guests praise the blistered margherita and balanced negroni list nightly';
  const reviewBodies = Array.from({ length: 20 }, (_, index) =>
    `Review ${index + 1}: ${quote} with extra guest detail about pacing value and repeat visits this season.`);
  const pages = [
    dossierPage(urlA, `Harbor Lantern Bar site. ${quote}. Average 4.6 from 820 published reviews. Entrees from 48 per person.`),
    dossierPage(urlB, reviewBodies.join(' ')),
    dossierPage(urlC, `Article calls the margherita the signature cocktail-bar pie.`),
  ];
  return prepareDossierFindings({ thing: 'Harbor Lantern Bar', pages, attempts: [] }, {
    summary: { value: 'Balanced cocktails and blistered pies', quote: 'balanced negroni list', url: urlA },
    description: {
      value: 'Harbor Lantern Bar pairs a deep negroni program with wood-fired pies, and Harbor Lantern Bar regulars cite the blistered margherita and happy-hour value in long-form reviews across the saved pages while the raw bar, dessert counter, and late espresso service keep the room full from open to close.',
      quote: 'blistered margherita',
      url: urlA,
    },
    price: { value: 48, unit: 'per person', quote: 'entrees from 48 per person', url: urlA },
    rating: {
      average: 4.6,
      count: 820,
      scaleMax: 5,
      quote: 'Average 4.6 from 820 published reviews',
      url: urlA,
      starMix: [328, 164, 82, 164, 82],
    },
    knownFor: [{ item: 'margherita', quote: 'margherita the signature', url: urlC }],
    reviewExcerpts: reviewBodies.map((body) => ({ quote: body, url: urlB })),
    reviews: [
      {
        text: 'The margherita crust and negroni balance justified the hype, and the margherita stayed consistent across two visits this month while the room kept its energy without feeling rushed.',
        rating: 5,
        cites: ['blistered margherita'],
        verdict: true,
      },
      {
        text: 'Host stand efficiency stayed calm during the pre-show rush, and the team kept ticket pickup moving without making the lobby feel chaotic or rushed for first-time visitors.',
        rating: 4,
        cites: ['extra guest detail about pacing'],
        verdict: false,
      },
      {
        text: 'Sidewalk seating stayed comfortable even with passing traffic, and the staff checked in often enough that water refills and menu questions never had to wait long.',
        rating: 4,
        cites: ['repeat visits this season'],
        verdict: false,
      },
      {
        text: 'Checkout timing was predictable on a packed night, and the margherita remained the dish guests mentioned most often when comparing this room to nearby options.',
        rating: 5,
        cites: ['balanced negroni list'],
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
  assert.equal(flaggedXai.review1, undefined);
  assert.equal(flaggedXai.googleRating, undefined);
  assert.equal(flaggedXai.xaiRatingsFetched, false);

  const sparseThemes = enrichPlaceRecordWithXaiRatings(
    {},
    { evidenceDossier: { thing: 'Sparse themes place', pages: [dossierPage('https://example.com/x', 'rating only page without breadth')], attempts: [] } },
  );
  assert.ok(sparseThemes.missingFields.includes('reviews'));
  assert.equal(sparseThemes.review1, undefined);
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
