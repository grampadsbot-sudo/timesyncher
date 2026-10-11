const SOURCE_IDS = new Set(['prior_db', 'osm', 'brave']);
const LIVE_SOURCE_ORDER = ['brave', 'osm'];
const MERGE_SOURCE_ORDER = ['brave', 'osm', 'prior_db'];
const PRIOR_CATEGORIES = new Map([
  ['grocery', 'grocery'],
  ['groceries', 'grocery'],
  ['market', 'market'],
  ['farmers_market', 'market'],
  ['restaurant', 'restaurant'],
  ['food', 'restaurant'],
  ['dining', 'restaurant'],
  ['store', 'store'],
  ['shop', 'store'],
  ['shopping', 'store'],
  ['garden', 'garden'],
  ['gardens', 'garden'],
  ['activity', 'activity'],
  ['attraction', 'activity'],
  ['tourism', 'activity'],
  ['event', 'activity'],
  ['hotel', 'hotel'],
  ['car', 'car'],
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function placeSources(place) {
  const fromList = Array.isArray(place?.sources) ? place.sources : [];
  const primary = String(place?.source || '').trim();
  const merged = [...fromList, primary].filter((source) => SOURCE_IDS.has(source));
  return MERGE_SOURCE_ORDER.filter((source) => merged.includes(source));
}

function primarySourceForMerged(sources) {
  for (const source of LIVE_SOURCE_ORDER) {
    if (sources.includes(source)) return source;
  }
  return 'prior_db';
}

function mergePlaceCategory(existing, incoming) {
  const live = String(incoming?.category || '').trim().toLowerCase();
  const saved = String(existing?.category || '').trim().toLowerCase();
  if (live === 'car' || saved === 'car') return 'car';
  return live || saved;
}

function mergePlaceFields(existing, incoming) {
  const preferLive = primarySourceForMerged(placeSources(incoming)) !== 'prior_db';
  const pick = (field) => {
    const liveValue = String(incoming?.[field] || '').trim();
    const savedValue = String(existing?.[field] || '').trim();
    if (preferLive && liveValue) return liveValue;
    return savedValue || liveValue;
  };
  return {
    lat: finite(incoming?.lat) ?? finite(existing?.lat),
    lng: finite(incoming?.lng) ?? finite(existing?.lng),
    address: pick('address'),
    url: pick('url'),
    externalId: pick('externalId'),
    ...(incoming?.categoryName || existing?.categoryName
      ? { categoryName: String(incoming?.categoryName || existing?.categoryName || '').trim() }
      : {}),
    ...(String(incoming?.description || existing?.description || '').trim()
      ? { description: String(incoming?.description || existing?.description || '').trim() }
      : {}),
    ...(incoming?.rating != null ? { rating: incoming.rating } : (existing?.rating != null ? { rating: existing.rating } : {})),
    ...(incoming?.ratingCount != null ? { ratingCount: incoming.ratingCount } : (existing?.ratingCount != null ? { ratingCount: existing.ratingCount } : {})),
  };
}

function recordDedupeMerge(dedupeMerges, existing, incoming, mergedSources) {
  if (!Array.isArray(dedupeMerges)) return;
  const liveSource = String(incoming?.source || '').trim();
  if (!LIVE_SOURCE_ORDER.includes(liveSource)) return;
  const lat = finite(incoming?.lat);
  const lng = finite(incoming?.lng);
  dedupeMerges.push({
    live: {
      provider: liveSource,
      name: String(incoming?.title || '').trim(),
      externalId: String(incoming?.externalId || '').trim(),
      ...(lat !== null && lng !== null ? { lat, lng } : {}),
    },
    priorDb: {
      title: String(existing?.title || '').trim(),
      externalId: String(existing?.externalId || '').trim(),
      ...(finite(existing?.lat) !== null && finite(existing?.lng) !== null
        ? { lat: finite(existing.lat), lng: finite(existing.lng) }
        : {}),
    },
    mergedSources,
  });
}

export function mergePlaces(groups = [], options = {}, samePlaceImpl) {
  if (typeof samePlaceImpl !== 'function') {
    throw new TypeError('mergePlaces requires samePlace');
  }
  const dedupeMerges = options.dedupeMerges;
  const kept = [];
  for (const group of groups) {
    for (const place of group || []) {
      const lat = finite(place?.lat);
      const lng = finite(place?.lng);
      const title = String(place?.title || '').trim();
      const category = PRIOR_CATEGORIES.get(String(place?.category || '').toLowerCase()) || '';
      const hasPoint = lat !== null && lng !== null;
      if (!title || !category || !SOURCE_IDS.has(place?.source)) continue;
      if (!hasPoint && !String(place.address || place.url || '').trim()) continue;
      const next = {
        source: place.source,
        title,
        category,
        lat,
        lng,
        address: String(place.address || ''),
        url: String(place.url || ''),
        externalId: String(place.externalId || ''),
        ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
        ...(String(place.description || '').trim() ? { description: String(place.description).trim() } : {}),
        ...(place.rating != null ? { rating: place.rating } : {}),
        ...(place.ratingCount != null ? { ratingCount: place.ratingCount } : {}),
      };
      const matchIndex = kept.findIndex((item) => samePlaceImpl(item, next));
      if (matchIndex >= 0) {
        const existing = kept[matchIndex];
        const mergedSources = placeSources({
          ...existing,
          sources: [...placeSources(existing), next.source],
        });
        recordDedupeMerge(dedupeMerges, existing, next, mergedSources);
        kept[matchIndex] = {
          ...existing,
          ...mergePlaceFields(existing, next),
          category: mergePlaceCategory(existing, next),
          source: primarySourceForMerged(mergedSources),
          sources: mergedSources,
        };
        continue;
      }
      kept.push({ ...next, sources: [next.source] });
    }
  }
  return kept;
}
