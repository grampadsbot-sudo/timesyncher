#!/usr/bin/env node
/**
 * Gate B check R live path: intake lodging turn (H) resolves Westin via Brave without
 * customerStatedLodging metadata or trip statedLodgingArea metadata; Kihei coffee turn
 * must not leak Kaanapali/Lahaina lodging into the reply prompt.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachPlaceSearchTurnScope } from '../src/vacation/place-search-reply-facts.mjs';
import { anchorRadiusPolicySnapshot, ANCHOR_RADIUS_SCOPE_LODGING } from '../src/vacation/place-search-radius-filter.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import {
  braveAddress,
  braveCategoryName,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  braveTitle,
} from '../src/vacation/brave-place-query.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import {
  modelVisibleTripContext,
  turnNamedSearchAwayFromStatedLodging,
} from '../src/vacation/provider-result-context.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { OUTSIDE_KIHEI_RE } from './shepherd-staging-smoke-helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/intake-lodging-brave/hyatt-live-h.json', import.meta.url)),
  'utf8',
));

function bravePlacesFromFixture(fixture) {
  const rows = [];
  for (let providerRank = 0; providerRank < bravePlaceSearchRows(fixture, 'local').length; providerRank += 1) {
    const result = bravePlaceSearchRows(fixture, 'local')[providerRank];
    if (!braveLocalPlaceResult(result)) continue;
    const point = bravePoint(result);
    const title = braveTitle(result?.title || result?.name);
    if (!title) continue;
    rows.push({
      source: 'brave',
      title,
      category: 'hotel',
      lat: point.lat,
      lng: point.lng,
      address: braveAddress(result),
      categoryName: braveCategoryName(result),
      providerCategories: braveProviderCategories(result),
      providerRank,
      sourceRecord: result,
    });
  }
  return rows;
}

function mockTripDb(tripId) {
  const tripThings = [];
  const tripMeta = {};
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('update trips') && sql.includes('statedLodgingArea')) {
      const area = values.find((value) => typeof value === 'string' && /Kaanapali/i.test(value));
      if (area) tripMeta.statedLodgingArea = area;
      return [];
    }
    if (sql.includes('from trips') && sql.includes('metadata')) {
      return [{ metadata: tripMeta }];
    }
    if (sql.includes('insert into trip_things')) {
      const title = values.find((value) => typeof value === 'string' && /Westin|Hyatt/i.test(value));
      const category = values.find((value) => value === 'hotel') ? 'hotel' : values[2];
      const location = values.find((value) => value && typeof value === 'object' && ('lat' in value || 'address' in value)) || {};
      const metadata = values.find((value) => value && typeof value === 'object' && value.source === 'brave') || {};
      tripThings.push({
        id: `thing-${tripThings.length + 1}`,
        trip_id: tripId,
        category: category || 'hotel',
        title,
        location,
        metadata,
        source: metadata.source || 'brave',
      });
      return [{ id: tripThings.at(-1).id }];
    }
    if (sql.includes('from trip_things') && sql.includes('order by')) {
      return tripThings.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: '',
        metadata: row.metadata || {},
        location: row.location || {},
        source: row.source,
      }));
    }
    return [];
  };
  return { db, tripThings, tripMeta };
}

const tripId = 'trip-h502';
const { db, tripThings } = mockTripDb(tripId);
const bravePlaces = bravePlacesFromFixture(FIXTURE);
const outcome = await persistIntakeLodgingThings(db, tripId, 'req-h502', [{
  title: 'The Westin Maui',
  category: 'hotel',
}], {
  areaHint: 'Kaanapali',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: bravePlaces,
    providers: [{ provider: 'brave', status: 'ok', resultCount: bravePlaces.length }],
  }),
});
assert.equal(outcome.saved.length, 1);
assert.equal(tripThings.length, 1);
assert.equal(tripThings[0].metadata?.customerStatedLodging, undefined);
assert.match(tripThings[0].title, /Westin Maui/i);

const KIHEI_CENTER = { lat: 20.763395, lng: -156.4463997, label: 'Kihei' };
const areaScope = anchorRadiusPolicySnapshot(KIHEI_CENTER, ANCHOR_RADIUS_SCOPE_LODGING, 'restaurant');
const inTurnRows = [
  { title: 'Kihei Caffe', lat: 20.7313, lng: -156.4518, category: 'restaurant', source: 'brave' },
  { title: 'Cafe Kula', lat: 20.7905, lng: -156.3267, category: 'restaurant', source: 'brave' },
];
const placeSearchReplyFacts = attachPlaceSearchTurnScope(
  { chatPlaceSearch: { scheduled: [], unscheduled: [] } },
  { anchor: 'Kihei', anchorIsLodging: false },
  { anchorRadiusPolicy: areaScope },
);

const tripContext = await enrichDraftingTripContext(
  { destination: 'Maui' },
  {
    things: tripThings,
    session: { trip_id: tripId },
    env: { DATABASE_URL: 'postgres://test' },
    placeSearchReplyFacts,
    inTurnPlaceResults: inTurnRows,
  },
);

assert.equal(turnNamedSearchAwayFromStatedLodging(tripContext), true);
assert.equal(tripContext.searchArea, 'Kihei');
assert.deepEqual(tripContext.citablePlaces, ['Kihei Caffe']);

const visible = modelVisibleTripContext(tripContext);
assert.equal(visible.customerOwnLodgingContext, undefined);
assert.equal(visible.lodging, undefined);
assert.equal(visible.statedLodgingArea, undefined);

const system = replyRulesSystem({}, 'Maui', false, false, 'coffee shops near Kihei', { tripContext });
assert.match(system, /Kihei Caffe/);
assert.match(system, /only about places near Kihei/i);
assert.equal(/Cafe Kula|Westin Maui|Kaanapali|Lahaina/i.test(system), false);
assert.equal(OUTSIDE_KIHEI_RE.test(system), false);

console.log(JSON.stringify({
  ok: true,
  checked: 'kihei-coffee-h502-lodging-path',
  lodgingTitle: tripThings[0].title,
}));
