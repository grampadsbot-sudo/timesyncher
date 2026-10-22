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
assert.equal(searchPlaceNeedsWebDetailEnrichment(ccabPlace), true, 'ccab semicolon hotel copy must need web detail');

const enriched = enrichSearchPlace(ccabPlace);
assert.ok(
  wordCount(enriched.summary) < 30 || descriptionPassesDetailJudge(enriched.summary, enriched.title),
  'summary must stay a short tagline when longDetails is absent',
);
assert.equal(enriched.description, '', 'semicolon ccab facts must not ship as description');

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
