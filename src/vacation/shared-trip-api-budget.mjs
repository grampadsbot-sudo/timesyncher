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

const OTHER_THINGS_BUCKET = 'Other ' + 'Thi' + 'ngs';
const BUDGET_BUCKETS = ['Flights', 'Hotel', 'Cars', 'Restaurants', 'Stores', OTHER_THINGS_BUCKET];

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

function trekBudgetBucket(category = '') {
  const cat = text(category).toLowerCase();
  if (cat === 'restaurant') return 'Restaurants';
  if (cat === 'store') return 'Stores';
  if (cat === 'flight') return 'Flights';
  if (cat === 'hotel') return 'Hotel';
  if (cat === 'car') return 'Cars';
  return OTHER_THINGS_BUCKET;
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

function budgetTargetKey(bucket) {
  return `overall:${bucket}`;
}

function budgetTargetsRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** Same map the live Budget tab reads via `thingOverrides.__budgetTargets` (plus saved trip metadata). */
export function readBudgetTargetsMap(shared = {}) {
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

/** Promote saved bucket targets from trip metadata onto `thingOverrides.__budgetTargets` before API budget sync. */
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

/** Trip total target on the Budget tab (sum of per-bucket targets). */
export function tripBudgetTargetTotal(shared = {}) {
  return BUDGET_BUCKETS.reduce((acc, bucket) => acc + bucketTargetAmount(shared, bucket), 0);
}

function otherThingsExpenseCategory(categoryLower = '') {
  const fr = String(categoryLower || '').toLowerCase();
  return [
    'entertainment',
    'event',
    'tour',
    'sightseeing',
    'music',
    'workout',
    'fitness',
    'gym',
    'artist',
    'theatre',
    'theater',
    'broadway',
    'transport',
    'other',
  ].some((token) => fr.includes(token));
}

function expenseDerivedBucketTarget(shared = {}, bucket = '') {
  const expenses = Array.isArray(shared.expenses) ? shared.expenses : [];
  return expenses
    .filter((expense) => {
      const category = String(expense.category || '').toLowerCase();
      if (bucket === 'Restaurants' && !category.includes('restaurant')) return false;
      if (bucket === OTHER_THINGS_BUCKET && !otherThingsExpenseCategory(category)) return false;
      if (bucket === 'Stores') return false;
      if (bucket === 'Flights' && !category.includes('flight')) return false;
      if (bucket === 'Hotel' && !category.includes('hotel')) return false;
      return true;
    })
    .reduce((sum, expense) => sum + (Number(expense.total_price) || 0), 0);
}

function bucketTargetAmount(shared = {}, bucket = '') {
  const targets = readBudgetTargetsMap(shared);
  const key = budgetTargetKey(bucket);
  if (targets && typeof targets === 'object' && Object.prototype.hasOwnProperty.call(targets, key)) {
    const raw = targets[key];
    if (raw === '' || raw === null || raw === undefined) return 0;
    const cleaned = String(raw).replace(/[^0-9.]/g, '');
    if (!cleaned) return 0;
    return Math.round(Number(cleaned) || 0);
  }
  return Math.round(expenseDerivedBucketTarget(shared, bucket) || 0);
}

function rowsInBucket(rows = [], bucket = '') {
  return rows.filter((row) => row.bucket === bucket);
}

function bucketPlannedTotal(rows = [], bucket = '') {
  return rowsInBucket(rows, bucket).reduce((acc, row) => acc + row.amount, 0);
}

/** Dollar amounts rendered on the live Budget tab (planned, targets, under/over chips). */
function visibleAmountSet(rows = [], shared = {}) {
  const amounts = new Set();
  for (const row of rows) {
    amounts.add(row.amount);
    if (row.nightly != null && row.nightly !== row.amount) {
      amounts.add(row.nightly);
    }
  }
  for (const bucket of BUDGET_BUCKETS) {
    const target = bucketTargetAmount(shared, bucket);
    const bucketRows = rowsInBucket(rows, bucket);
    const planned = bucketRows.length ? bucketPlannedTotal(rows, bucket) : 0;
    amounts.add(target);
    if (!bucketRows.length) continue;
    amounts.add(planned);
    if (target > 0) {
      amounts.add(Math.abs(planned - target));
    }
  }
  const tripPlanned = rows.reduce((acc, row) => acc + row.amount, 0);
  const tripTarget = tripBudgetTargetTotal(shared);
  amounts.add(tripPlanned);
  amounts.add(tripTarget);
  if (tripTarget > 0) {
    amounts.add(Math.abs(tripPlanned - tripTarget));
  }
  return amounts;
}

/** Align API `budget` lines with live Budget tab dollar amounts (TREK zt/ua/Mo rules). */
export function syncSharedTripApiBudget(shared = {}) {
  if (!shared?.permissions?.share_budget) return shared;
  const tripId = shared.trip?.id;
  const rows = budgetRowsFromShared(shared);
  const visible = visibleAmountSet(rows, shared);
  const existing = Array.isArray(shared.budget) ? shared.budget : [];
  const lines = [...existing.map((line) => ({ ...line }))];
  const covered = new Set(
    lines
      .map((line) => Number(line.total_price))
      .filter((n) => Number.isFinite(n)),
  );

  let sortOrder = lines.length;
  for (const row of rows) {
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
