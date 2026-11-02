import assert from 'node:assert/strict';

function wordCount(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
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

const placeholderHotel = enrichSearchPlace({
  title: 'Hotel Edison',
  category: 'hotel',
  description: 'Documented NYC option (hotel)',
  address: 'Times Square / Theater District, New York, NY',
  lat: 40.759647,
  lng: -73.9862944,
  source: 'brave',
  sourceRecord: {
    description: 'Documented NYC option (hotel)',
    price: 225,
    googleRating: '4.1',
    googleReviewCount: '12000',
    websiteFlavour: 'Hotel Edison has anchored 47th Street since the 1930s, offering art-deco details and a classic Times Square address steps from Broadway theaters.',
    reviewThemes: { praise: ['compact but clean rooms', 'lively lobby bar near Broadway'] },
  },
});
assert.equal(
  descriptionPassesDetailJudge(placeholderHotel.description, placeholderHotel.title),
  true,
  'search fill must compose a sourced hotel description when only placeholder copy is stored',
);
assert.ok(placeholderHotel.description.length >= 40);
assert.ok(placeholderHotel.price != null && placeholderHotel.price > 0);
