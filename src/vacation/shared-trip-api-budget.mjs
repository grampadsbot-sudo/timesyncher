import {
  BUDGET_BUCKET_ORDER,
  OTHER_THINGS_BUCKET,
  bucketTargetAmountFromMap,
} from './budget-bucket-keys.mjs';
import { intId } from './intake-shared-trip.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';

import { thingBudgetAmount, thingPeople, perPersonThing } from './thing-price.mjs';
import { assignedPlaceIds } from './itinerary-minimums.mjs';
import { provenanceBlocksSourcedPrice } from './shared-trip-live-app-fields.mjs';

function text(value) {
  return String(value || '').trim();
}

function trekBudgetBucket(category = '') {
  const cat = text(category).toLowerCase();
  if (cat === 'restaurant') return 'Restaurants';
  if (cat === 'store') return 'Stores';
  if (cat === 'flight') return 'Flights';
  if (cat === 'hotel') return 'Hotel';
  if (cat === 'car') return 'Cars';
  return OTHER_THINGS_BUCKET;
}

export function trekBudgetAmount(place = {}, override = {}, category = '', shared = {}) {
  return thingBudgetAmount(place, override, category, shared);
}

function budgetRowsFromShared(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {};
  const rows = [];
  const selected = assignedPlaceIds(shared);
  const dayIds = new Set((shared.days || []).map((day) => String(day.id)));
  for (const place of places) {
    const override = overrides[`place:${place.id}`] || {};
    const placed = Array.isArray(override.dayIds) && override.dayIds.some((id) => dayIds.has(String(id)));
    if (!selected.has(Number(place.id)) && !placed) continue;
    const category = productThingCategory(place, override);
    const bucket = trekBudgetBucket(category);
    const { amount, hasPrice, nightly } = trekBudgetAmount(place, override, category, shared);
    rows.push({ place, override, category, bucket, amount, hasPrice, nightly });
  }
  return rows;
}

function budgetTargetsRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function readBudgetTargetsMap(shared = {}) {
  const merged = {};
  const tripMeta = shared?.trip?.metadata;
  const meta = budgetTargetsRecord(tripMeta) || {};
  const sources = [
    budgetTargetsRecord(meta.__budgetTargets),
    budgetTargetsRecord(meta.thingOverrides?.__budgetTargets),
    budgetTargetsRecord(meta.preCollaboratorSnapshot?.thingOverrides?.__budgetTargets),
    budgetTargetsRecord(shared?.thingOverrides?.__budgetTargets),
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const [key, raw] of Object.entries(source)) {
      if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
      merged[key] = raw;
    }
  }
  return merged;
}

export function applyTripMetadataBudgetTargets(shared = {}, trip = {}) {
  const meta = trip?.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
    ? trip.metadata
    : {};
  const fromMeta = readBudgetTargetsMap({ ...shared, trip: { ...shared.trip, metadata: meta } });
  if (!Object.keys(fromMeta).length) return shared;
  const thingOverrides = {
    ...(shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {}),
    __budgetTargets: {
      ...(shared.thingOverrides?.__budgetTargets || {}),
      ...fromMeta,
    },
  };
  return { ...shared, thingOverrides };
}

export function tripBudgetTargetTotal(shared = {}) {
  let sum = 0;
  let any = false;
  for (const bucket of BUDGET_BUCKET_ORDER) {
    const amount = bucketTargetAmount(shared, bucket);
    if (amount === null) continue;
    any = true;
    sum += amount;
  }
  return any ? sum : null;
}

function bucketTargetAmount(shared = {}, bucket = '') {
  return bucketTargetAmountFromMap(readBudgetTargetsMap(shared), bucket);
}

function rowsInBucket(rows = [], bucket = '') {
  return rows.filter((row) => row.bucket === bucket);
}

function bucketPlannedTotal(rows = [], bucket = '') {
  return rowsInBucket(rows, bucket).reduce((acc, row) => acc + row.amount, 0);
}

function visibleAmountSet(rows = [], shared = {}) {
  const amounts = new Set();
  for (const row of rows) {
    amounts.add(row.amount);
    if (row.nightly != null && row.nightly !== row.amount) {
      amounts.add(row.nightly);
    }
  }
  for (const bucket of BUDGET_BUCKET_ORDER) {
    const target = bucketTargetAmount(shared, bucket);
    const bucketRows = rowsInBucket(rows, bucket);
    const planned = bucketRows.length ? bucketPlannedTotal(rows, bucket) : 0;
    if (!bucketRows.length) continue;
    amounts.add(planned);
    if (target === null) continue;
    amounts.add(target);
    if (target > 0) {
      amounts.add(Math.abs(planned - target));
    }
  }
  const tripPlanned = rows.reduce((acc, row) => acc + row.amount, 0);
  const tripTarget = tripBudgetTargetTotal(shared);
  amounts.add(tripPlanned);
  if (tripTarget !== null) {
    amounts.add(tripTarget);
    if (tripTarget > 0) {
      amounts.add(Math.abs(tripPlanned - tripTarget));
    }
  }
  return amounts;
}

export function budgetGateAllowedAmounts(shared = {}) {
  const rows = budgetRowsFromShared(shared);
  const allowed = visibleAmountSet(rows, shared);
  for (const line of Array.isArray(shared.budget) ? shared.budget : []) {
    const n = Number(line.total_price ?? line.amount ?? line.total);
    if (Number.isFinite(n)) allowed.add(n);
  }
  return allowed;
}

export function syncSharedTripApiBudget(shared = {}) {
  if (!shared?.permissions?.share_budget) return shared;
  const tripId = shared.trip?.id;
  const rows = budgetRowsFromShared(shared);
  const visible = visibleAmountSet(rows, shared);
  const existing = Array.isArray(shared.budget) ? shared.budget : [];
  const overrides = { ...(shared.thingOverrides || {}) };
  for (const row of rows) {
    const key = `place:${row.place.id}`;
    if (perPersonThing(row.place, row.override, row.category) && !provenanceBlocksSourcedPrice(row.override, row.place)) {
      overrides[key] = {
        ...overrides[key],
        ...row.override,
        ...(row.hasPrice ? { pricePerPerson: row.nightly } : {}),
        people: thingPeople(row.place, row.override, shared),
      };
    }
  }
  if (!rows.length) {
    return { ...shared, thingOverrides: overrides, budget: [] };
  }
  const rowPlaceIds = new Set(rows.map((row) => String(row.place.id)));
  const lines = [
    ...existing.filter((line) => line.place_id && rowPlaceIds.has(String(line.place_id))),
    ...existing.filter((line) => !line.place_id),
  ].map((line) => ({ ...line }));
  const coveredPlaces = new Set(lines.map((line) => String(line.place_id ?? '')));
  const coveredIds = new Set(lines.map((line) => String(line.id)));
  const covered = new Set(
    lines
      .map((line) => Number(line.total_price))
      .filter((n) => Number.isFinite(n)),
  );

  for (const row of rows) {
    const placeId = String(row.place.id);
    const nameKey = text(row.place.name || row.place.title).toLowerCase();
    for (const line of lines) {
      const linePlace = String(line.place_id ?? '');
      const lineName = text(line.name).toLowerCase();
      const samePlace = linePlace && linePlace === placeId;
      const sameName = lineName && lineName === nameKey;
      if (!samePlace && !sameName) continue;
      line.total_price = row.amount;
      line.place_id = row.place.id;
    }
  }

  let sortOrder = lines.length;
  for (const row of rows) {
    const id = intId(`${tripId}:budget:place:${row.place.id}`);
    const placeId = String(row.place.id);
    if (coveredPlaces.has(placeId) || coveredIds.has(String(id))) continue;
    lines.push({
      id,
      trip_id: tripId,
      place_id: row.place.id,
      category: row.bucket,
      name: text(row.place.name || row.place.title) || 'Trip item',
      total_price: row.amount,
      note: '',
      sort_order: sortOrder,
    });
    coveredPlaces.add(placeId);
    coveredIds.add(String(id));
    covered.add(row.amount);
    sortOrder += 1;
  }

  for (const amount of visible) {
    if (covered.has(amount)) continue;
    lines.push({
      id: intId(`${tripId}:budget:total:${amount}`),
      trip_id: tripId,
      category: 'Trip',
      name: 'Trip budget total',
      total_price: amount,
      note: '',
      sort_order: sortOrder,
    });
    covered.add(amount);
    sortOrder += 1;
  }

  const pricedHotelNames = new Set(
    rows
      .filter((row) => row.bucket === 'Hotel' && row.hasPrice)
      .map((row) => text(row.place.name || row.place.title).toLowerCase())
      .filter(Boolean),
  );
  const keptHotelNames = new Set();
  const deduped = [];
  for (const line of lines) {
    if (line.category !== 'Hotel') {
      deduped.push(line);
      continue;
    }
    const nameKey = text(line.name).toLowerCase();
    const priced = Number(line.total_price) > 0;
    if (pricedHotelNames.has(nameKey)) {
      if (priced) {
        if (keptHotelNames.has(nameKey)) continue;
        keptHotelNames.add(nameKey);
      } else if (keptHotelNames.has(nameKey)) {
        continue;
      }
    }
    deduped.push(line);
  }

  return { ...shared, thingOverrides: overrides, budget: deduped };
}
