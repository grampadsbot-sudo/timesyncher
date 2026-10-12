/** Add catalog rows keyed by display name when the trip payload omits documented options. */

function text(value) {
  return String(value ?? '').trim();
}

function nextPlaceId(places = []) {
  let max = 0;
  for (const place of places) {
    const id = Number(place?.id);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max + 1;
}

function categoryMeta(categoriesByKey, categoryKey) {
  const key = text(categoryKey).toLowerCase();
  if (key === 'flight') return categoriesByKey.flight;
  if (key === 'hotel') return categoriesByKey.hotel;
  if (key === 'restaurant') return categoriesByKey.restaurant;
  if (key === 'store') return categoriesByKey.store;
  if (key === 'car') return categoriesByKey.car;
  return categoriesByKey.activity;
}

/**
 * @param {Record<string, unknown>} shared
 * @param {Record<string, Record<string, unknown>>} enrichmentByName
 * @param {Record<string, { id: number, name: string, icon?: string }>} categoriesByKey
 */
export function mergeNamedCatalogEnrichment(shared = {}, enrichmentByName = {}, categoriesByKey = {}) {
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = {
    ...(shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {}),
  };
  const names = new Set(places.map((place) => text(place.name || place.title)).filter(Boolean));
  let idCursor = nextPlaceId(places);

  for (const [name, record] of Object.entries(enrichmentByName || {})) {
    const title = text(name);
    if (!title || names.has(title)) continue;
    const row = record && typeof record === 'object' ? record : {};
    const categoryKey = text(row.category || 'other').toLowerCase();
    const kind = categoryMeta(categoriesByKey, categoryKey);
    const lat = row.lat != null ? Number(row.lat) : null;
    const lng = row.lng != null ? Number(row.lng) : null;
    const id = idCursor;
    idCursor += 1;
    const place = {
      id,
      trip_id: shared.trip?.id ?? null,
      name: title,
      title,
      description: text(row.description || row.summary),
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      address: text(row.address),
      category_id: kind?.id,
      category_name: kind?.name || 'Attraction',
      category_icon: kind?.icon,
      category: kind
        ? { id: kind.id, name: kind.name, icon: kind.icon }
        : { name: 'Attraction', icon: '🏛️' },
      reservation_status: 'considering',
      website: text(row.website),
      notes: '',
      source: 'catalog-enrichment',
      price: row.price != null ? row.price : undefined,
    };
    places.push(place);
    names.add(title);
    thingOverrides[`place:${id}`] = {
      category: categoryKey === 'music' ? 'event' : categoryKey,
      summary: text(row.summary || row.description),
      longDetails: text(row.description || row.summary),
      details: text(row.description || row.summary),
      price: row.price != null ? row.price : undefined,
      logoUrl: text(row.logoUrl) || undefined,
      timeline: false,
    };
  }

  return { ...shared, places, thingOverrides };
}
