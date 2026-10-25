

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

const PER_PERSON_CATEGORIES = new Set([
  'restaurant',
  'store',
  'event',
  'family_event',
  'tour',
  'transport',
  'music',
  'workout',
  'artist',
  'theatre',
  'sightseeing',
  'other',
  'flight',
]);

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
  return Array.isArray(dayIds) && dayIds.length > 0;
}

function placeOnTimeline(place, trip) {
  const id = Number(place?.id);
  if (id && assignedPlaceIds(trip).has(id)) return true;
  return placeHasDayPlacement(place, trip);
}

function haFields(place, override) {
  return { ...place, ...override };
}

function priceText(place, trip) {
  const override = overrideFor(trip, place);
  const row = haFields(place, override);
  const raw = row.price ?? place.price;
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'string' && !text(raw)) return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return `$${raw}`;
  return text(raw);
}

function parsePriceNumbers(priceStr = '') {
  const hay = String(priceStr || '');
  const nums = [...hay.matchAll(/\$?([0-9][0-9,]*(?:\.\d+)?)/g)]
    .map((match) => Number(String(match[1]).replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return { nightly: null, numbers: [] };
  const nightly = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  return { nightly, numbers: nums };
}

function stayDays(place, trip) {
  const override = overrideFor(trip, place);
  const row = haFields(place, override);
  const explicit = Number(row.stayDays);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const checkIn = text(row.checkInDate || row.check_in_date);
  const checkOut = text(row.checkOutDate || row.check_out_date);
  if (checkIn && checkOut) {
    const start = Date.parse(`${checkIn}T00:00:00Z`);
    const end = Date.parse(`${checkOut}T00:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.round((end - start) / 86400000));
    }
  }
  return 7;
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
  const category = tabCategoryKey(place, trip);
  const override = overrideFor(trip, place);
  const priceStr = priceText(place, trip);
  const { nightly, numbers } = parsePriceNumbers(priceStr);
  if (nightly === null) return { amount: 0, hasPrice: false, nightly: null };
  const hasPrice = /\$?\d/.test(priceStr);
  let amount = nightly;
  const lower = priceStr.toLowerCase();
  if (category === 'hotel' || /night/.test(lower)) {
    amount *= Math.max(1, stayDays(place, trip));
  }
  if (/per person|pp|fare|ticket|flight/.test(lower) || PER_PERSON_CATEGORIES.has(category)) {
    amount *= 2;
  }
  return { amount: Math.round(amount), hasPrice, nightly: Math.round(nightly) };
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
  const timelineIds = assignedPlaceIds(trip);
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
    push(`row_on_timeline_${id}`, timelineIds.has(Number(row.place.id)));
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
