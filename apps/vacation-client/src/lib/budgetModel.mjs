

import {
  formatUsd,
  placeName,
  tabCategoryKey,
} from './listTabModel.mjs';

export { formatUsd };
import { resolvePlace } from './dayTimelineModel.mjs';
import {
  BUDGET_BUCKET_ORDER,
  OTHER_THINGS_BUCKET,
  bucketTargetAmountFromMap,
} from '../../../../src/vacation/budget-bucket-keys.mjs';
import { assignedPlaceIds } from '../../../../src/vacation/itinerary-minimums.mjs';

export { OTHER_THINGS_BUCKET, BUDGET_BUCKET_ORDER };

const BUDGET_REQUIRED_PRICE_BUCKETS = new Set(['Flights', 'Hotel', 'Cars']);

import { thingBudgetAmount } from '../../../../src/vacation/thing-price.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function catalogPlace(trip, id) {
  return (trip?.places || []).find((p) => String(p.id) === String(id));
}

export function canonicalBudgetPlace(trip, placeOrId) {
  const id = placeOrId && typeof placeOrId === 'object' ? placeOrId.id : placeOrId;
  return catalogPlace(trip, id) || (placeOrId && typeof placeOrId === 'object' ? placeOrId : null);
}

function rememberBudgetPlace(seen, place) {
  if (!place || place.id == null) return;
  const id = String(place.id);
  const prev = seen.get(id);
  seen.set(id, prev ? { ...prev, ...place } : place);
}

function placeHasDayPlacement(place, trip) {
  const dayIds = overrideFor(trip, place).dayIds;
  return Array.isArray(dayIds) && dayIds.some((id) => (trip?.days || []).some((day) => String(day.id) === String(id)));
}

function placeOnTimeline(place, trip) {
  const id = Number(place?.id);
  if (id && assignedPlaceIds(trip).has(id)) return true;
  return placeHasDayPlacement(place, trip);
}

export function budgetBucketForPlace(place, trip) {
  const cat = tabCategoryKey(place, trip);
  if (cat === 'restaurant') return 'Restaurants';
  if (cat === 'store') return 'Stores';
  if (cat === 'flight') return 'Flights';
  if (cat === 'hotel') return 'Hotel';
  if (cat === 'car') return 'Cars';
  return OTHER_THINGS_BUCKET;
}

export function budgetLineAmount(place, trip) {
  return thingBudgetAmount(place, overrideFor(trip, place), tabCategoryKey(place, trip), trip);
}

function readBudgetTargetsMap(trip = {}) {
  const merged = {};
  const tripMeta = trip?.trip?.metadata;
  const meta = tripMeta && typeof tripMeta === 'object' && !Array.isArray(tripMeta) ? tripMeta : {};
  const sources = [
    trip.thingOverrides?.__budgetTargets,
    meta.__budgetTargets,
    meta.thingOverrides?.__budgetTargets,
    meta.preCollaboratorSnapshot?.thingOverrides?.__budgetTargets,
  ];
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const [key, raw] of Object.entries(source)) {
      if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
      merged[key] = raw;
    }
  }
  return merged;
}

export function bucketTargetAmount(trip, bucket) {
  return bucketTargetAmountFromMap(readBudgetTargetsMap(trip), bucket);
}

export function tripBudgetTargetTotal(trip) {
  let sum = 0;
  let any = false;
  for (const bucket of BUDGET_BUCKET_ORDER) {
    const amount = bucketTargetAmount(trip, bucket);
    if (amount === null) continue;
    any = true;
    sum += amount;
  }
  return any ? sum : null;
}

export function placesForBudget(trip) {
  const seen = new Map();
  for (const rows of Object.values(trip?.assignments || {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const place = resolvePlace(row, trip);
      rememberBudgetPlace(seen, place);
    }
  }
  for (const place of trip?.places || []) {
    if (!placeHasDayPlacement(place, trip)) continue;
    rememberBudgetPlace(seen, place);
  }
  return [...seen.values()];
}

export function bucketDisplayLabel(bucket) {
  return bucket === OTHER_THINGS_BUCKET ? 'The Rest' : bucket;
}

export function bucketIcon(bucket) {
  if (bucket === 'Flights') return '✈️';
  if (bucket === 'Hotel') return '🧳';
  if (bucket === 'Cars') return '🚗';
  if (bucket === 'Restaurants') return '🍽️';
  if (bucket === 'Stores') return '🛍️';
  return '🎭';
}

export function varianceLabel(planned, target, currency = 'USD') {
  if (target === null) return null;
  const delta = planned - target;
  if (delta === 0) return null;
  const abs = Math.abs(delta);
  return delta < 0
    ? `Under by ${formatUsd(abs, currency)}`
    : `Over by ${formatUsd(abs, currency)}`;
}

export function buildBudgetModel(trip) {
  const currency = trip?.trip?.currency || 'USD';
  const rows = placesForBudget(trip).map((place) => {
    const bucket = budgetBucketForPlace(place, trip);
    const pricing = budgetLineAmount(place, trip);
    return {
      place,
      bucket,
      name: placeName(place),
      ...pricing,
    };
  });

  const buckets = BUDGET_BUCKET_ORDER.map((label) => {
    const bucketRows = rows.filter((row) => row.bucket === label);
    const planned = bucketRows.reduce((acc, row) => acc + row.amount, 0);
    const timelinePlanned = bucketRows
      .filter((row) => placeOnTimeline(row.place, trip))
      .reduce((acc, row) => acc + row.amount, 0);
    const target = bucketTargetAmount(trip, label);
    const omit = planned === 0 && (target === null || target === 0) && bucketRows.length === 0;
    return {
      label,
      displayLabel: bucketDisplayLabel(label),
      icon: bucketIcon(label),
      rows: bucketRows.sort((a, b) => a.name.localeCompare(b.name)),
      planned,
      timelinePlanned,
      target,
      variance: varianceLabel(planned, target, currency),
      omit,
    };
  }).filter((bucket) => !bucket.omit);

  const tripPlanned = rows.reduce((acc, row) => acc + row.amount, 0);
  const tripTimelinePlanned = rows
    .filter((row) => placeOnTimeline(row.place, trip))
    .reduce((acc, row) => acc + row.amount, 0);
  const tripTarget = tripBudgetTargetTotal(trip);

  return {
    currency,
    rows,
    buckets,
    tripPlanned,
    tripTimelinePlanned,
    tripTarget,
    tripVariance: varianceLabel(tripPlanned, tripTarget, currency),
    isEmpty: rows.length === 0,
  };
}

export function budgetCompletenessChecks(trip) {
  const model = buildBudgetModel(trip);
  const checks = [];
  const push = (name, pass) => checks.push({ name, pass: !!pass });

  push('non_empty_budget', !model.isEmpty);
  push('trip_planned_matches_rows', model.tripPlanned === model.rows.reduce((a, r) => a + r.amount, 0));

  for (const place of placesForBudget(trip)) {
    const id = String(place.id);
    push(`row_place_${id}`, model.rows.some((row) => String(row.place.id) === id));
  }

  for (const row of model.rows) {
    const id = String(row.place.id);
    push(`row_on_timeline_${id}`, placeOnTimeline(row.place, trip));
    const catalog = canonicalBudgetPlace(trip, id);
    if (!catalog) continue;
    const expectedName = placeName(catalog);
    const expectedBucket = budgetBucketForPlace(catalog, trip);
    const expectedPricing = budgetLineAmount(catalog, trip);
    push(`row_identity_${id}`, row.name === expectedName);
    push(`row_bucket_${id}`, row.bucket === expectedBucket);
    push(
      `row_amount_${id}`,
      row.amount === expectedPricing.amount && row.hasPrice === expectedPricing.hasPrice,
    );
  }

  for (const bucket of model.buckets) {
    const sum = bucket.rows.reduce((a, r) => a + r.amount, 0);
    push(`bucket_total_${bucket.label}`, bucket.planned === sum);
    const timelineSum = bucket.rows
      .filter((row) => placeOnTimeline(row.place, trip))
      .reduce((a, r) => a + r.amount, 0);
    push(`bucket_timeline_total_${bucket.label}`, bucket.timelinePlanned === timelineSum);
  }

  push(
    'trip_timeline_total',
    model.tripTimelinePlanned
      === model.rows.filter((row) => placeOnTimeline(row.place, trip)).reduce((a, r) => a + r.amount, 0),
  );

  const apiLines = Array.isArray(trip?.budget) ? trip.budget : [];
  if (apiLines.length) {
    const apiAmounts = new Set(
      apiLines
        .map((line) => Number(line.total_price ?? line.amount ?? line.total))
        .filter((n) => Number.isFinite(n)),
    );
    for (const row of model.rows) {
      if (!row.hasPrice) continue;
      push(`row_amount_on_api_${row.place.id}`, apiAmounts.has(row.amount));
    }
  }

  const savedTargets = readBudgetTargetsMap(trip);
  for (const [key, raw] of Object.entries(savedTargets)) {
    if (!String(key).startsWith('overall:')) continue;
    const bucket = String(key).slice('overall:'.length);
    const parsed = bucketTargetAmount(trip, bucket);
    push(`saved_target_${bucket}`, parsed !== null);
    push(`saved_target_raw_${bucket}`, String(raw) !== undefined);
  }

  if (tripBudgetTargetTotal(trip) !== null) {
    push('trip_target_sum', Number.isFinite(tripBudgetTargetTotal(trip)));
  }

  const missingRequiredPrices = model.rows.filter(
    (row) => BUDGET_REQUIRED_PRICE_BUCKETS.has(row.bucket) && !row.hasPrice,
  );
  push('required_travel_budget_prices', missingRequiredPrices.length === 0);
  for (const row of missingRequiredPrices) {
    push(`required_price_${row.bucket}_${row.place.id}`, false);
  }

  const missingOptionalPrices = model.rows.filter(
    (row) => !BUDGET_REQUIRED_PRICE_BUCKETS.has(row.bucket) && !row.hasPrice,
  );
  push(`report_optional_budget_missing_prices_${missingOptionalPrices.length}`, true);

  return checks;
}

export function budgetCompletenessScore(trip) {
  const checks = budgetCompletenessChecks(trip);
  const pass = checks.filter((c) => c.pass).length;
  return { pass, total: checks.length, checks };
}
