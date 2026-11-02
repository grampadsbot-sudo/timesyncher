import assert from 'node:assert/strict';

function wordCount(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import {
  applySourcedHotelDescriptionToRecord,
  composeSourcedHotelDescriptionFromRecord,
} from '../src/vacation/xai-sourced-hotel-description.mjs';
import {
  mergeWebDetailIntoSearchPlace,
  searchPlaceNeedsWebDetailEnrichment,
} from '../src/vacation/search-place-detail-enrichment.mjs';
import { enrichSearchPlace } from '../src/vacation/trip-thing-enrichment.mjs';
import { buildGateBSearchPlaceForRow } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { NYC_STAGING_CAPTURE_LIST_ROWS } from './fixtures/nyc-vk-list-tab-rows.mjs';

const hotelRow = NYC_STAGING_CAPTURE_LIST_ROWS.find((row) => row.id === 616);
assert.ok(hotelRow, 'Hotel Edison list row fixture');

const ccabPlace = buildGateBSearchPlaceForRow(hotelRow);
assert.equal(
  searchPlaceNeedsWebDetailEnrichment(ccabPlace),
  false,
  'fixture prose hotel copy must not require web detail enrichment',
);

const enriched = enrichSearchPlace(ccabPlace);
assert.equal(
  descriptionPassesDetailJudge(enriched.description, enriched.title),
  true,
  'fixture hotel description must pass detail judge',
);
assert.ok(
  wordCount(enriched.summary) < 30 || descriptionPassesDetailJudge(enriched.summary, enriched.title),
  'summary must stay a short tagline',
);
assert.ok(enriched.price != null && enriched.price > 0, 'hotel price must survive enrichment');

const prose = 'Hotel Edison sits in the Times Square theater district with a classic 1930s lobby, strong Broadway foot traffic, and compact Midtown rooms that trade space for location. Guests mention the grand public areas, late-night diner, and easy subway access while noting that standard rooms can feel dated and busy on show nights.';
const merged = mergeWebDetailIntoSearchPlace(ccabPlace, {
  detail: {
    longDetails: prose,
    summary: 'Hotel Edison in Times Square',
    summarySourceUrls: ['https://www.edisonhotelnyc.com/', 'https://www.booking.com/hotel/us/edison.html'],
    category: 'hotel',
    title: ccabPlace.title,
  },
  sourceRecord: { ...ccabPlace.sourceRecord, longDetails: prose },
  detailEnriched: true,
  missingDetailFields: [],
});
const finalized = enrichSearchPlace(merged);
assert.equal(descriptionPassesDetailJudge(finalized.description, finalized.title), true);
assert.ok(finalized.price != null && finalized.price > 0, 'hotel price must survive enrichment');
assert.ok(
  Array.isArray(finalized.sourceRecord.summarySourceUrls)
  && finalized.sourceRecord.summarySourceUrls.length >= 2,
  'summarySourceUrls must persist',
);

const thinHotel = applySourcedHotelDescriptionToRecord({
  category: 'hotel',
  googleRating: '4.2',
  googleReviewCount: '900',
  reviewThemes: { praise: ['great location near Lincoln Center', 'quiet rooms for NYC', 'helpful front desk'] },
  websiteFlavour: 'Upper West Side hotel with classic pre-war charm and walkable access to Central Park.',
  price: 518,
}, { title: 'Hotel Belleclaire Central Park', category: 'hotel' });
assert.equal(descriptionPassesDetailJudge(thinHotel.description, 'Hotel Belleclaire Central Park'), true);

const composedOnly = composeSourcedHotelDescriptionFromRecord({
  websiteFlavour: 'Times Square micro-hotel with compact rooms and strong transit links.',
  googleRating: '4.0',
  googleReviewCount: '500',
  price: 210,
}, { title: 'Sample Hotel', address: 'New York, NY' });
assert.ok(composedOnly.split(/\s+/).length >= 30);
assert.equal(descriptionPassesDetailJudge(composedOnly, 'Sample Hotel'), true);
