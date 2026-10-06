import { intId } from './intake-shared-trip.mjs';
import { productThingCategory } from './keepsake-product-overrides.mjs';

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

const BUDGET_BUCKETS = ['Flights', 'Hotel', 'Cars', 'Restaurants', 'Stores', 'Other Things'];

function text(value) {
  return String(value || '').trim();
}

function haFields(place = {}, override = {}) {
  return { ...place, ...override, ...(override && typeof override === 'object' ? override : {}) };
}

function priceText(place = {}, override = {}) {
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

function stayDays(place = {}, override = {}) {
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

export function trekBudgetBucket(category = '') {
  const cat = text(category).toLowerCase();
  if (cat === 'restaurant') return 'Restaurants';
  if (cat === 'store') return 'Stores';
  if (cat === 'flight') return 'Flights';
  if (cat === 'hotel') return 'Hotel';
  if (cat === 'car') return 'Cars';
  return 'Other Things';
}

export function trekBudgetAmount(place = {}, override = {}, category = '') {
  const priceStr = priceText(place, override);
  const { nightly, numbers } = parsePriceNumbers(priceStr);
  if (nightly === null) return { amount: 0, hasPrice: false, nightly: null };
  const hasPrice = /\$?\d/.test(priceStr);
  let amount = nightly;
  const lower = priceStr.toLowerCase();
  const cat = text(category).toLowerCase();
  if (cat === 'hotel' || /night/.test(lower)) {
    amount *= Math.max(1, stayDays(place, override));
  }
  if (
    /per person|pp|fare|ticket|flight/.test(lower)
    || PER_PERSON_CATEGORIES.has(cat)
  ) {
    amount *= 2;
  }
  return { amount: Math.round(amount), hasPrice, nightly: Math.round(nightly) };
}

function budgetRowsFromShared(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {};
  const rows = [];
  for (const place of places) {
    const override = overrides[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    const bucket = trekBudgetBucket(category);
    const { amount, hasPrice, nightly } = trekBudgetAmount(place, override, category);
    rows.push({ place, override, category, bucket, amount, hasPrice, nightly });
  }
  return rows;
}

function visibleAmountSet(rows = []) {
  const amounts = new Set();
  for (const row of rows) {
    if (!row.hasPrice || row.amount <= 0) continue;
    amounts.add(row.amount);
    if (row.nightly != null && row.nightly > 0 && row.nightly !== row.amount) {
      amounts.add(row.nightly);
    }
  }
  for (const bucket of BUDGET_BUCKETS) {
    const sum = rows.filter((row) => row.bucket === bucket).reduce((acc, row) => acc + row.amount, 0);
    if (sum > 0) amounts.add(sum);
  }
  const tripTotal = rows.reduce((acc, row) => acc + row.amount, 0);
  if (tripTotal > 0) amounts.add(tripTotal);
  return amounts;
}

/** Align API `budget` lines with live Budget tab dollar amounts (TREK zt/ua/Mo rules). */
export function syncSharedTripApiBudget(shared = {}) {
  if (!shared?.permissions?.share_budget) return shared;
  const tripId = shared.trip?.id;
  const rows = budgetRowsFromShared(shared);
  const visible = visibleAmountSet(rows);
  const existing = Array.isArray(shared.budget) ? shared.budget : [];
  const lines = [...existing.map((line) => ({ ...line }))];
  const covered = new Set(
    lines
      .map((line) => Number(line.total_price))
      .filter((n) => Number.isFinite(n)),
  );

  let sortOrder = lines.length;
  for (const row of rows) {
    if (!row.hasPrice || row.amount <= 0) continue;
    if (covered.has(row.amount)) continue;
    lines.push({
      id: intId(`${tripId}:budget:place:${row.place.id}`),
      trip_id: tripId,
      category: row.bucket,
      name: text(row.place.name || row.place.title) || 'Trip item',
      total_price: row.amount,
      note: '',
      sort_order: sortOrder,
    });
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

  return { ...shared, budget: lines };
}
