import {
  applyXaiPlaceRatingsToRecord,
  enrichPlaceRecordWithXaiRatings,
  parseXaiStructuredPayload,
  writeRepresentativeReviews,
} from '../../src/vacation/xai-grok-place-ratings.mjs';

export function vkContractText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeVkContractReviewBody(body) {
  return vkContractText(body).toLowerCase();
}

export function assertXaiGrokPlaceRatingsContract(assert, searchPlaceOutputViolations) {
  const mockXaiJson = {
    google: { average: 4.6, reviewCount: 820, sourceUrl: 'https://example.com/google', notPublished: false },
    yelp: { average: 4.4, reviewCount: 410, sourceUrl: 'https://example.com/yelp', notPublished: false },
    otherSites: [
      { average: 4.7, reviewCount: 15309, sourceUrl: 'https://example.com/tripadvisor' },
      { average: 4.5, reviewCount: 2200, sourceUrl: 'https://example.com/opentable' },
      { average: 4.8, reviewCount: 900, sourceUrl: 'https://example.com/booking' },
    ],
    reviewThemes: {
      praise: [
        'Cocktails are balanced and the bartenders know classics without being pretentious',
        'Happy hour oysters are a strong value before the dinner rush fills the room',
        'The dining room feels lively but service stays attentive on busy nights',
        'Desserts and espresso finish the meal with the same care as the savory courses',
      ],
      complaints: ['Weekend waits can stretch when every bar seat is taken'],
    },
    websiteFlavour: 'Seasonal Italian-American plates and a deep negroni list',
  };
  const parsedXai = parseXaiStructuredPayload(JSON.stringify(mockXaiJson));
  assert.equal(parsedXai.google.average, 4.6);
  assert.equal(parsedXai.otherSites.length, 3);
  assert.ok(parsedXai.otherSites[0].sourceUrl.includes('tripadvisor'));
  const xaiRecord = {};
  applyXaiPlaceRatingsToRecord(xaiRecord, parsedXai);
  assert.equal(xaiRecord.googleRating, '4.6');
  assert.equal(xaiRecord.googleReviewCount, '820');
  assert.match(String(xaiRecord.thirdPartyRating), /4\.7/);
  assert.equal(xaiRecord.ratingCount, 820);
  assert.equal(xaiRecord.ratingMix, undefined);
  writeRepresentativeReviews(xaiRecord, parsedXai, { title: 'Sample Cocktail Bar' });
  assert.equal(xaiRecord.review1Source, undefined);
  assert.ok(String(xaiRecord.review1).split(/\s+/).length >= 12);
  assert.match(String(xaiRecord.review1), /Seasonal Italian-American/i);
  const xaiPlace = {
    category: 'restaurant',
    title: 'Sample Cocktail Bar',
    summary: 'Short summary that names why this bar fits a NYC night out.',
    description: 'Long description about the bar that stays distinct from the summary and mentions the negroni program, happy hour, and Midtown foot traffic without copying review text.',
    price: 48,
    logoUrl: 'https://example.com/favicon.ico',
    lat: 40.752,
    lng: -73.977,
    sourceRecord: { ...xaiRecord, xaiRatingsFetched: true },
  };
  const xaiViolations = searchPlaceOutputViolations(xaiPlace);
  assert.deepEqual(xaiViolations, [], `mocked xAI place should pass contract: ${xaiViolations.join(', ')}`);
  const flaggedXai = enrichPlaceRecordWithXaiRatings(
    { review1: 'Old tavily snippet that should be cleared when xAI returns nothing useful', review1Source: 'Google', review1Rating: '5' },
    parseXaiStructuredPayload(JSON.stringify({
      google: { notPublished: true },
      yelp: { notPublished: true },
      otherSites: [],
      reviewThemes: { praise: [], complaints: [] },
      websiteFlavour: '',
    })),
    { title: 'Empty ratings place' },
  );
  assert.ok(flaggedXai.missingFields.includes('ratings'));
  assert.ok(flaggedXai.missingFields.includes('reviews'));
  assert.equal(flaggedXai.review1, undefined);
  assert.equal(flaggedXai.googleRating, undefined);
  assert.equal(flaggedXai.xaiRatingsFetched, false);

  const sparseThemes = enrichPlaceRecordWithXaiRatings(
    {},
    parseXaiStructuredPayload(JSON.stringify({
      google: { average: 4.5, reviewCount: 100, sourceUrl: 'https://example.com/google', notPublished: false },
      yelp: { notPublished: true },
      otherSites: [],
      reviewThemes: {
        praise: ['Friendly staff', 'Good value'],
        complaints: ['Noise on weekends'],
      },
      websiteFlavour: 'Casual dining room',
    })),
    { title: 'Sparse themes place' },
  );
  assert.ok(sparseThemes.missingFields.includes('reviews'));
  assert.equal(sparseThemes.review1, undefined);
  assert.equal(sparseThemes.xaiRatingsFetched, true);

  const tenPoint = parseXaiStructuredPayload(JSON.stringify({
    google: { notPublished: true },
    yelp: { notPublished: true },
    otherSites: [{ average: 8.6, reviewCount: 500, sourceUrl: 'https://example.com/booking' }],
    reviewThemes: { praise: [], complaints: [] },
    websiteFlavour: '',
  }));
  assert.equal(tenPoint.otherSites[0].average, 4.3);
}
