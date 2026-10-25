#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildBudgetModel, budgetCompletenessChecks } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import { gateBBudgetPriceCompleteness } from '../src/vacation/gate-b-budget-price-completeness.mjs';
import { fileURLToPath } from 'node:url';
import { loadFixtureReplaySharedTripFromPath } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  buildGateBSearchPlaceForRow,
  buildPr336VkSearchPlacesByRowId,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  enrichSearchPlace,
  estimateSearchPlacePrice,
} from '../src/vacation/trip-thing-enrichment.mjs';
import { gateBCapturePreDataCheck } from './ops/capture/capture-pre-data-check.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';

async function assertFixtureReplayGateBReady(fixturePath, label) {
  const replayResult = loadFixtureReplaySharedTripFromPath(fixturePath);
  assert.ok(replayResult, `${label}: NYC fixture replay payload must load`);
  const replayServed = replayResult.served;
  const replayBudget = buildBudgetModel(replayServed);
  const replayMissing = replayBudget.rows.filter((row) => !row.hasPrice);
  assert.deepEqual(
    replayMissing.map((row) => row.name),
    [],
    `${label}: Gate B fixture replay must price every budget row, missing: ${replayMissing.map((row) => row.name).join(', ')}`,
  );
  const gateBudgetPrices = gateBBudgetPriceCompleteness(replayServed);
  assert.equal(gateBudgetPrices.pass, true, `${label}: gateBBudgetPriceCompleteness`);
  const preData = await gateBCapturePreDataCheck(replayServed);
  assert.equal(preData.pass, true, `${label}: capture pre-data: ${JSON.stringify(preData.failures?.slice(0, 3))}`);
  let hotels = 0;
  let hotelDescPass = 0;
  for (const place of replayServed.places || []) {
    const override = replayServed.thingOverrides?.[`place:${place.id}`] || {};
    if (productThingCategory(place, override) !== 'hotel') continue;
    hotels += 1;
    if (descriptionPassesDetailJudge(rowSummary(place, replayServed), place.name)) hotelDescPass += 1;
  }
  assert.ok(hotels >= 20, `${label}: expected NYC hotel rows, got ${hotels}`);
  assert.ok(
    hotelDescPass / hotels >= 0.8,
    `${label}: hotel list description quality ${hotelDescPass}/${hotels} (need >=80%)`,
  );
}

const BUDGET_CATEGORIES = new Set([
  'flight',
  'hotel',
  'car',
  'restaurant',
  'store',
  'activity',
  'event',
  'music',
]);

const gateBRows = [
  { id: 601, name: 'JetBlue LAS → JFK', cat: 'flight' },
  { id: 602, name: "Zabar's", cat: 'store' },
  { id: 603, name: 'Motto by Hilton New York City Times Square', cat: 'hotel' },
  { id: 608, name: 'The Manhattan Club', cat: 'hotel' },
  { id: 609, name: 'Priceline opaque Standard sedan', cat: 'car' },
  { id: 610, name: 'Carbone', cat: 'restaurant' },
  { id: 611, name: 'Jazz at Lincoln Center', cat: 'activity' },
];

for (const row of gateBRows) {
  const place = buildGateBSearchPlaceForRow(row);
  const thing = placeToTripThing(place);
  const price = thing.price ?? thing.metadata?.price;
  assert.ok(price != null && price !== '' && price !== 0, `VK fill must set price on ${row.id} ${row.cat}`);
}

const restaurantEstimate = estimateSearchPlacePrice({
  category: 'restaurant',
  title: 'Neighborhood bistro',
  sourceRecord: { priceLevel: '$$' },
});
assert.equal(restaurantEstimate, 42);

const hotelEstimate = estimateSearchPlacePrice({
  category: 'hotel',
  title: 'Midtown stay',
  description: '',
  sourceRecord: {},
});
assert.equal(hotelEstimate, '$250-$350/night');

const enrichedNoSourcePrice = enrichSearchPlace({
  category: 'store',
  title: 'Corner market',
  summary: 'Quick stop for snacks.',
  description: 'Neighborhood market with prepared foods and picnic supplies.',
  sourceRecord: { source: 'brave' },
});
assert.ok(enrichedNoSourcePrice.price != null && enrichedNoSourcePrice.price > 0);

const trip = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const model = buildBudgetModel(trip);
const missing = model.rows.filter((row) => !row.hasPrice);
assert.deepEqual(
  missing.map((row) => `${row.bucket}:${row.name}`),
  [],
  `every NYC budget row must show a fill price, missing: ${missing.map((row) => row.name).join(', ')}`,
);

const hasFlight = model.rows.some((row) => row.bucket === 'Flights');
const hasHotel = model.rows.some((row) => row.bucket === 'Hotel');
assert.equal(hasFlight, true, 'NYC test fixture must include at least one flight budget row');
assert.equal(hasHotel, true, 'NYC test fixture must include at least one hotel budget row');
assert.equal(
  model.rows.some((row) => row.bucket === 'Cars'),
  false,
  'list-only car row 609 must not appear on the timeline-only budget tab',
);

const gateBudgetPrices = gateBBudgetPriceCompleteness(trip);
assert.equal(gateBudgetPrices.pass, true);
assert.equal(gateBudgetPrices.optionalMissingPriceCount, 0);
assert.equal(
  budgetCompletenessChecks(trip).find((check) => check.name === 'required_travel_budget_prices')?.pass,
  true,
);

const searchPlaces = buildPr336VkSearchPlacesByRowId(gateBRows);
for (const row of gateBRows) {
  if (!BUDGET_CATEGORIES.has(row.cat) && row.cat !== 'activity') continue;
  const place = searchPlaces[row.id];
  assert.ok(place?.price != null && place.price !== 0, `search fill price on place ${row.id}`);
}

const stagingFixturePath = fileURLToPath(
  new URL('./fixtures/gate-b-nyc-shared-staging.json', import.meta.url),
);
const captureReplayFixturePath = fileURLToPath(
  new URL('./fixtures/gate-b-nyc-capture-replay.json', import.meta.url),
);

await assertFixtureReplayGateBReady(
  process.env.TSV_CAPTURE_FIXTURE || stagingFixturePath,
  'staging-or-TSV_CAPTURE_FIXTURE',
);
await assertFixtureReplayGateBReady(captureReplayFixturePath, 'gate-b-nyc-capture-replay');

console.log('NYC budget search fill price tests passed');
