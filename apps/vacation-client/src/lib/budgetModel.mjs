/** Budget derivation for the preview client (tested from test/budget.unit.mjs). */

import { buildDayTimeline, sortedDays } from './dayTimelineModel.mjs';
import {
  LIST_TAB_IDS,
  placeName,
  placesForCategoryTab,
  tabCategoryKey,
} from './listTabModel.mjs';

export const OTHER_THINGS_BUCKET = 'Other Things';
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

/** Places on the day-by-day timeline (TREK Budget tab `Mo` / `Ci` rows, minus travel + car spans). */
function placesFromItineraryTimeline(trip) {
  const seen = new Map();
  for (const day of sortedDays(trip)) {
    for (const entry of buildDayTimeline(trip, day)) {
      if (entry.kind === 'travel') continue;
      if (entry.kind === 'car-pickup' || entry.kind === 'car-dropoff') continue;
      if (entry.place) {
        seen.set(String(entry.place.id), entry.place);
        continue;
      }
      const title = text(entry.title);
      if (!title) continue;
      const stubId = entry.id || title;
      seen.set(String(stubId), {
        id: stubId,
        name: title,
        category_name: entry.category === 'flight' || /^Flight option:/i.test(title) ? 'Flight' : 'Activity',
      });
    }
  }
  return [...seen.values()];
}

/** List-tab catalog plus every timeline-selected thing (R2 + live Budget `Mo`). */
export function placesForBudget(trip) {
  const seen = new Map();
  const add = (place) => {
    if (place && place.id != null) seen.set(String(place.id), place);
  };
  for (const place of trip?.places || []) {
    add(place);
  }
  for (const tab of LIST_TAB_IDS) {
    for (const place of placesForCategoryTab(trip, tab)) {
      add(place);
    }
  }
  for (const place of placesFromItineraryTimeline(trip)) {
    add(place);
  }
  for (const day of sortedDays(trip)) {
    for (const entry of buildDayTimeline(trip, day)) {
      if (entry.kind === 'travel' || entry.kind === 'car-pickup' || entry.kind === 'car-dropoff') continue;
      const title = text(entry.title);
      if (!/^Flight option:/i.test(title)) continue;
      if (entry.place) {
        add(entry.place);
        continue;
      }
      add({
        id: entry.id || title,
        name: title,
        category_name: 'Flight',
      });
    }
  }
  for (const place of trip?.places || []) {
    const override = overrideFor(trip, place);
    const dayIds = override.dayIds;
    if (Array.isArray(dayIds) && dayIds.length) {
      add(place);
    }
  }
  for (const rows of Object.values(trip?.assignments || {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const place = row.place || (trip.places || []).find((p) => String(p.id) === String(row.place_id));
      if (place) add(place);
    }
  }
  for (const line of trip?.budget || []) {
    const name = text(line?.name);
    if (!name) continue;
    const matched = [...seen.values()].find((place) => placeName(place) === name);
    if (matched) continue;
    add({
      id: line.id ?? name,
      name,
      category_name: text(line.category) || 'Activity',
      price: line.total_price ?? line.amount,
    });
  }
  for (const res of trip?.reservations || []) {
    const title = text(res?.title || res?.name);
    if (!/^Flight option:/i.test(title)) continue;
    const place =
      (trip.places || []).find((p) => String(p.id) === String(res.place_id))
      || (typeof res.place === 'object' ? res.place : null);
    if (place) {
      add(place);
      continue;
    }
    if (res.place_id != null) {
      add({
        id: res.place_id,
        name: title,
        category_name: 'Flight',
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
    const target = bucketTargetAmount(trip, label);
    const omit = planned === 0 && (target === null || target === 0) && bucketRows.length === 0;
    return {
      label,
      displayLabel: bucketDisplayLabel(label),
      icon: bucketIcon(label),
      rows: bucketRows.sort((a, b) => a.name.localeCompare(b.name)),
      planned,
      target,
      variance: varianceLabel(planned, target),
      omit,
    };
  }).filter((bucket) => !bucket.omit);

  const tripPlanned = rows.reduce((acc, row) => acc + row.amount, 0);
  const tripTarget = tripBudgetTargetTotal(trip);

  return {
    currency,
    rows,
    buckets,
    tripPlanned,
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

  for (const bucket of model.buckets) {
    const sum = bucket.rows.reduce((a, r) => a + r.amount, 0);
    push(`bucket_total_${bucket.label}`, bucket.planned === sum);
    for (const row of bucket.rows) {
      push(`row_amount_${row.place.id}`, Number.isFinite(row.amount));
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
