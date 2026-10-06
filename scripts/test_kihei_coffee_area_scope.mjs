#!/usr/bin/env node
/**
 * Gate B check R residual: Kihei-scoped coffee must not cite Cafe Kula or Westin Kaanapali,
 * and must not leak Kaanapali lodging/stay copy into the reply prompt.
 * Fails on base when out-of-area rows reach citablePlaces or customerOwnLodgingContext;
 * passes after area-scope filter and lodging omission.
 */
import assert from 'node:assert/strict';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { attachPlaceSearchTurnScope } from '../src/vacation/place-search-reply-facts.mjs';
import { anchorRadiusPolicySnapshot, ANCHOR_RADIUS_SCOPE_LODGING } from '../src/vacation/place-search-radius-filter.mjs';
import {
  applyInTurnCitablePlaces,
  citablePlaceTitles,
  filterInTurnPlaceRowsForAreaScope,
  modelVisibleTripContext,
} from '../src/vacation/provider-result-context.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { OUTSIDE_KIHEI_RE } from './shepherd-staging-smoke-helpers.mjs';

const KIHEI_CENTER = { lat: 20.763395, lng: -156.4463997, label: 'Kihei' };
const areaScope = anchorRadiusPolicySnapshot(KIHEI_CENTER, ANCHOR_RADIUS_SCOPE_LODGING, 'restaurant');

const inTurnRows = [
  { title: 'Kihei Caffe', name: 'Kihei Caffe', lat: 20.7313, lng: -156.4518, category: 'restaurant', source: 'brave' },
  { title: 'Cafe Kula', name: 'Cafe Kula', lat: 20.7905, lng: -156.3267, category: 'restaurant', source: 'brave' },
  {
    title: "The Westin Maui Resort & Spa, Ka'anapali",
    name: "The Westin Maui Resort & Spa, Ka'anapali",
    lat: 20.9198,
    lng: -156.695,
    category: 'restaurant',
    source: 'brave',
  },
];

const scopedRows = filterInTurnPlaceRowsForAreaScope(inTurnRows, areaScope);
assert.equal(scopedRows.some((row) => /kihei caffe/i.test(row.title)), true);
assert.equal(scopedRows.some((row) => /cafe kula/i.test(row.title)), false, 'Cafe Kula outside Kihei anchor radius');
assert.equal(scopedRows.some((row) => /westin/i.test(row.title)), false, 'Westin Kaanapali outside Kihei anchor radius');

const unscopedCitable = citablePlaceTitles(inTurnRows);
assert.equal(unscopedCitable.some((t) => /cafe kula|westin/i.test(t)), true, 'base: out-of-area venues were citable');

const scopedFacts = applyInTurnCitablePlaces(
  { searchArea: 'Kihei', placeSearchAreaScope: areaScope, itinerary: [] },
  inTurnRows,
);
assert.deepEqual(scopedFacts.citablePlaces, ['Kihei Caffe']);

const WESTIN = "The Westin Maui Resort & Spa, Ka'anapali";
const things = [
  {
    category: 'hotel',
    title: WESTIN,
    metadata: { customerStatedLodging: true, source: 'chat_extraction' },
    location: { locality: "Ka'anapali", address: '2365 Kaanapali Pkwy, Lahaina, HI 96761' },
  },
];

const placeSearchReplyFacts = attachPlaceSearchTurnScope(
  { chatPlaceSearch: { scheduled: [], unscheduled: [] } },
  { anchor: 'Kihei', anchorIsLodging: false },
  { anchorRadiusPolicy: areaScope },
);

const tripContext = await enrichDraftingTripContext(
  {
    destination: 'Maui',
    statedLodgingArea: 'Kaanapali',
    lodging: WESTIN,
    customerOwnLodgingContext: {
      label: "Customer's own lodging (context only; not a search result; never recommend or describe it as a find)",
      statedLodgingArea: 'Kaanapali',
      lodging: WESTIN,
    },
  },
  { things, session: null, env: {}, placeSearchReplyFacts, inTurnPlaceResults: inTurnRows },
);

assert.equal(tripContext.searchArea, 'Kihei');
assert.deepEqual(tripContext.citablePlaces, ['Kihei Caffe']);
assert.equal(tripContext.tripReplyGate.some((row) => /westin|hyatt/i.test(row.name)), false);
assert.equal(tripContext.tripReplyGate.some((row) => /kihei/i.test(row.name)), true);
assert.equal(tripContext.tripReplyGate.some((row) => /^maui$/i.test(String(row.name || '').trim())), false);

const visible = modelVisibleTripContext(tripContext);
assert.equal(visible.placeSearchAreaScope, undefined);
assert.equal(visible.tripReplyGate, undefined);
assert.equal(visible.customerOwnLodgingContext, undefined, 'Kaanapali lodging must not reach model-visible context on Kihei-scoped turn');
assert.equal(visible.statedLodgingArea, undefined);
assert.equal(visible.lodging, undefined);

const westinReply = "Try coffee at The Westin Maui Resort & Spa, Ka'anapali after Cafe Kula.";
const stayingCopy = "Since you're staying in Kaanapali but exploring Kihei, try Kihei Caffe.";
assert.ok(OUTSIDE_KIHEI_RE.test(stayingCopy), 'base repro: lodging stay copy trips Gate B OUTSIDE_KIHEI');
const violation = inTurnPlaceReplyViolation(westinReply, scopedRows, { tripPlaceAllowRows: tripContext.tripReplyGate });
assert.equal(violation?.status, 'unsourced_place');
assert.ok(violation?.invented?.some((name) => /westin|cafe kula/i.test(name)));

const system = replyRulesSystem({}, 'Maui', false, false, 'coffee shops near Kihei', { tripContext });
assert.match(system, /Kihei Caffe/);
assert.equal(/Cafe Kula|Westin Maui|Kaanapali/i.test(system), false);
assert.match(system, /only about places near Kihei/i);
assert.equal(OUTSIDE_KIHEI_RE.test(system), false, 'reply prompt must not name out-of-Kihei areas');

console.log(JSON.stringify({ ok: true, checked: 'kihei-coffee-area-scope', citable: scopedFacts.citablePlaces }));
