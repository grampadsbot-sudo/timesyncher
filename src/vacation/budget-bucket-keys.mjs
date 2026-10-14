const STANDARD_BUDGET_BUCKETS = ['Flights', 'Hotel', 'Cars', 'Restaurants', 'Stores'];

export const OTHER_THINGS_BUCKET = 'Events';

export const BUDGET_BUCKET_ORDER = [...STANDARD_BUDGET_BUCKETS, OTHER_THINGS_BUCKET];

const STANDARD_BUCKET_SET = new Set(STANDARD_BUDGET_BUCKETS);

function targetBucketId(bucket) {
  const name = String(bucket ?? '').trim();
  if (STANDARD_BUCKET_SET.has(name) || name === OTHER_THINGS_BUCKET) return name;
  return OTHER_THINGS_BUCKET;
}

function budgetTargetKey(bucket) {
  return `overall:${bucket}`;
}

function parseTargetRaw(raw) {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  return Math.round(Number(cleaned) || 0);
}

function legacyMiscTargetEntry(targets) {
  if (!targets || typeof targets !== 'object') return null;
  const canonicalKey = budgetTargetKey(OTHER_THINGS_BUCKET);
  if (Object.prototype.hasOwnProperty.call(targets, canonicalKey)) {
    return { key: canonicalKey, raw: targets[canonicalKey] };
  }
  const legacy = [];
  for (const [key, raw] of Object.entries(targets)) {
    if (!String(key).startsWith('overall:')) continue;
    const bucket = String(key).slice('overall:'.length);
    if (STANDARD_BUCKET_SET.has(bucket) || bucket === OTHER_THINGS_BUCKET) continue;
    legacy.push({ key, raw });
  }
  if (legacy.length !== 1) return null;
  return legacy[0];
}

export function bucketTargetAmountFromMap(targets, bucket) {
  if (!targets || typeof targets !== 'object') return null;
  const bucketId = targetBucketId(bucket);
  const key = budgetTargetKey(bucketId);
  if (Object.prototype.hasOwnProperty.call(targets, key)) {
    return parseTargetRaw(targets[key]);
  }
  if (bucketId === OTHER_THINGS_BUCKET) {
    const legacy = legacyMiscTargetEntry(targets);
    if (legacy) return parseTargetRaw(legacy.raw);
  }
  return null;
}

