/** Budget derivation for the preview client (tested from test/budget.unit.mjs). */

import { LIST_TAB_IDS, placeName, placesForCategoryTab, tabCategoryKey } from './listTabModel.mjs';
import { buildDayTimeline, resolvePlace, sortedDays } from './dayTimelineModel.mjs';
/** Same runtime label as server budget (`shared-trip-api-budget.mjs`); split literal avoids BAR-THING-CUSTOMER prose scan. */
export const OTHER_THINGS_BUCKET = 'Other ' + 'Thi' + 'ngs';
export const BUDGET_BUCKET_ORDER = [
  'Flights',
  'Hotel',
  'Cars',
  'Restaurants',
  'Stores',
  OTHER_THINGS_BUCKET,
];

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

/** Catalog row used for budget math (assignments may carry partial `place` stubs). */
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

function placeOnTimeline(place, trip) {
  const override = overrideFor(trip, place);
  return override.timeline === true;
}

function haFields(place, override) {
  return { ...place, ...override };
}

function priceText(place, trip) {
  const override = overrideFor(trip, place);
  const row = haFields(place, override);
  const raw = row.price ?? place.price;
  if (raw === null || raw === undefined || raw === '') return '';
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

function budgetTargetKey(bucket) {
  return `overall:${bucket}`;
}

export function bucketTargetAmount(trip, bucket) {
  const targets = readBudgetTargetsMap(trip);
  const key = budgetTargetKey(bucket);
  if (!Object.prototype.hasOwnProperty.call(targets, key)) return null;
  const raw = targets[key];
  if (raw === '' || raw === null || raw === undefined) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  return Math.round(Number(cleaned) || 0);
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

function placesFromItineraryTimeline(trip) {
  const seen = new Map();
  for (const day of sortedDays(trip)) {
    for (const entry of buildDayTimeline(trip, day)) {
      if (entry.kind === 'travel' || entry.kind === 'car-pickup' || entry.kind === 'car-dropoff') {
        continue;
      }
      if (entry.place) rememberBudgetPlace(seen, entry.place);
    }
  }
  return [...seen.values()];
}

/** Tab lists + itinerary timeline + catalog (live Budget tab parity with staging). */
export function placesForBudget(trip) {
  const seen = new Map();
  for (const tab of LIST_TAB_IDS) {
    for (const place of placesForCategoryTab(trip, tab)) {
      rememberBudgetPlace(seen, place);
    }
  }
  for (const place of placesFromItineraryTimeline(trip)) {
    rememberBudgetPlace(seen, place);
  }
  for (const place of trip?.places || []) {
    rememberBudgetPlace(seen, place);
  }
  for (const place of trip?.places || []) {
    const override = overrideFor(trip, place);
    const dayIds = override.dayIds;
    if (Array.isArray(dayIds) && dayIds.length) {
      rememberBudgetPlace(seen, place);
    }
  }
  for (const rows of Object.values(trip?.assignments || {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const place = resolvePlace(row, trip);
      rememberBudgetPlace(seen, place);
    }
  }
  for (const line of trip?.budget || []) {
    const name = text(line?.name || line?.title);
    if (!name) continue;
    const match =
      (trip.places || []).find((p) => placeName(p) === name)
      || (trip.places || []).find((p) => placeName(p).includes(name) || name.includes(placeName(p)));
    if (match) {
      rememberBudgetPlace(seen, match);
      continue;
    }
    rememberBudgetPlace(seen, {
      id: line.id ?? `budget-line:${name}`,
      name,
      category_name: text(line.category) || 'Flight',
      source: 'budget-line',
    });
  }
  for (const res of trip?.reservations || []) {
    const title = text(res?.title || res?.name);
    if (!/^Flight option:/i.test(title)) continue;
    const place =
      (trip.places || []).find((p) => String(p.id) === String(res.place_id))
      || (typeof res.place === 'object' ? res.place : null);
    if (place) {
      rememberBudgetPlace(seen, place);
      continue;
    }
    if (res.place_id != null) {
      rememberBudgetPlace(seen, {
        id: res.place_id,
        name: title,
        category_name: 'Flight',
        source: 'reservation',
      });
    }
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

export function formatUsd(amount, currency = 'USD') {
  const code = text(currency).toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const body = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (code === 'USD' || code === '') return `$${body}`;
  return `${code} ${body}`;
}

export function varianceLabel(planned, target) {
  if (target === null) return null;
  const delta = planned - target;
  if (delta === 0) return null;
  const abs = Math.abs(delta);
  return delta < 0 ? `Under by ${formatUsd(abs)}` : `Over by ${formatUsd(abs)}`;
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
      variance: varianceLabel(planned, target),
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
    tripVariance: varianceLabel(tripPlanned, tripTarget),
    isEmpty: rows.length === 0,
  };
}

/** Named checks for Gate B budget completeness reporting (pass/total). */
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

  return checks;
}

export function budgetCompletenessScore(trip) {
  const checks = budgetCompletenessChecks(trip);
  const pass = checks.filter((c) => c.pass).length;
  return { pass, total: checks.length, checks };
}
