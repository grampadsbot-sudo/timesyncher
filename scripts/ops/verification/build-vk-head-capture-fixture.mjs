import { readFileSync, writeFileSync } from 'node:fs';

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildVkHeadCaptureFixture(baseFixture, snapshotObj, outPath) {
  const fx = typeof baseFixture === 'string' ? loadJson(baseFixture) : structuredClone(baseFixture);
  const snap = typeof snapshotObj === 'string' ? loadJson(snapshotObj) : snapshotObj;
  if (!snap || typeof snap !== 'object' || !Object.keys(snap).length) {
    throw new Error('data snapshot is empty or not an object');
  }
  const cats = {};
  for (const c of fx.categories || []) {
    if (c && typeof c === 'object') cats[String(c.name || '').toLowerCase()] = c.id;
  }
  const tripId = fx.trip?.id ?? 1;
  const places = (fx.places || []).filter((p) => p && typeof p === 'object');
  const have = new Set(places.map((p) => String(p.id)));
  const overrides = { ...(fx.thingOverrides || {}) };
  const sortedIds = Object.keys(snap).sort((a, b) => Number(a) - Number(b));
  for (const rid of sortedIds) {
    const src = snap[rid];
    if (!src || typeof src !== 'object') throw new Error(`snapshot row ${rid} is not an object`);
    if (have.has(String(rid))) throw new Error(`snapshot row ${rid} collides with a base fixture place id`);
    const cat = String(src.category || '').toLowerCase();
    places.push({
      id: Number(rid),
      trip_id: tripId,
      name: src.title,
      description: src.description,
      lat: src.lat,
      lng: src.lng,
      address: src.address || null,
      category_id: cats[cat],
      category_name: src.category,
      price: src.price,
      currency: 'USD',
      website: src.url || null,
      reservation_status: 'considering',
      duration_minutes: 60,
      transport_mode: 'walking',
    });
    const keys = [
      'title', 'summary', 'description', 'logoUrl', 'price', 'lat', 'lng', 'reviews',
      'sourceRecord', 'externalId', 'source', 'url', 'address', 'category',
    ];
    overrides[String(rid)] = {};
    for (const k of keys) {
      if (k in src) overrides[String(rid)][k] = src[k];
    }
  }
  fx.places = places;
  fx.thingOverrides = overrides;
  writeFileSync(outPath, `${JSON.stringify(fx, null, 1)}\n`, 'utf8');
  return outPath;
}
