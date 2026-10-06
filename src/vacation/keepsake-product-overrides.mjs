import { isLodgingStay } from './intake-lodging-stay.mjs';
import { transportKind } from './intake-transport-kind.mjs';
import { normalizeThingType, resolveThingType } from './timeline-icons.mjs';
import { resolveThingLogoUrl } from './thing-logo-capture.mjs';

function text(value) {
  return String(value || '').trim();
}

function sourceObject(...rows) {
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) return row;
  }
  return null;
}

function finiteCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

export function resolveThingCoords(place = {}, override = {}) {
  const source = sourceObject(override.source, place.source, override.sourceRecord, place.sourceRecord);
  const pairs = [
    [override.lat ?? override.latitude, override.lng ?? override.longitude],
    [place.lat ?? place.latitude, place.lng ?? place.longitude],
    [source?.lat ?? source?.latitude, source?.lng ?? source?.longitude],
  ];
  for (const [lat, lng] of pairs) {
    const la = finiteCoord(lat);
    const ln = finiteCoord(lng);
    if (la != null && ln != null) return [la, ln];
  }
  return null;
}

function transportKindRecord(place = {}, override = {}) {
  const meta = place.metadata && typeof place.metadata === 'object' ? place.metadata : {};
  return {
    category: override.category || place.category?.name || place.category_name || place.category,
    category_name: place.category_name || place.category?.name,
    title: place.name || place.title,
    name: place.name || place.title,
    metadata: meta,
    providerCategories: place.providerCategories
      || meta.providerCategories
      || override.providerCategories,
  };
}

export function productThingCategory(place = {}, override = {}) {
  const transportRecord = transportKindRecord(place, override);
  const kind = transportKind(transportRecord);
  if (kind === 'flight') return 'flight';
  if (kind === 'car' && !isLodgingStay(transportRecord)) return 'car';
  const resolved = resolveThingType(place, override);
  if (resolved && resolved !== 'other') return resolved;
  return normalizeThingType(place.category_name || place.category?.name) || resolved || 'other';
}

function copyBlank(next, key, ...values) {
  if (text(next[key])) return;
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value.map((item) => text(item)).filter(Boolean);
      if (items.length) next[key] = items;
      return;
    }
    if (text(value)) {
      next[key] = text(value);
      return;
    }
  }
}

/** Keep summary, happy hour, and neighborhood only when the Thing or its source record already has them. */
function applySourcedFields(place = {}, override = {}) {
  const source = sourceObject(override.source, place.source, override.sourceRecord, place.sourceRecord);
  const next = { ...override };
  copyBlank(next, 'summary', place.summary, source?.summary);
  copyBlank(next, 'longDetails', place.longDetails, source?.longDetails, source?.details);
  copyBlank(next, 'happyHourDetails', place.happyHourDetails, source?.happyHourDetails);
  copyBlank(next, 'neighborhood', place.neighborhood, source?.neighborhood);
  if ((!Array.isArray(next.happyHourSources) || !next.happyHourSources.length) && Array.isArray(source?.happyHourSources)) {
    copyBlank(next, 'happyHourSources', source.happyHourSources);
  }
  if (next.happyHour == null) {
    const flag = place.happyHour ?? source?.happyHour;
    if (typeof flag === 'boolean') next.happyHour = flag;
  }
  if (!Array.isArray(next.restaurantTags) || !next.restaurantTags.length) {
    const tags = Array.isArray(place.restaurantTags) ? place.restaurantTags : source?.restaurantTags;
    if (Array.isArray(tags)) copyBlank(next, 'restaurantTags', tags);
  }
  return next;
}

export function applyProductKeepsakeOverrides(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    const category = productThingCategory(place, override);
    override.category = category;
    const coords = resolveThingCoords(place, override);
    if (coords) {
      override.lat = coords[0];
      override.lng = coords[1];
      if (finiteCoord(place.lat) == null) place.lat = coords[0];
      if (finiteCoord(place.lng) == null) place.lng = coords[1];
    }
    Object.assign(override, applySourcedFields(place, override));
    if (!text(override.logoUrl)) {
      const logoUrl = resolveThingLogoUrl(place, override);
      if (logoUrl) override.logoUrl = logoUrl;
    }
    next.thingOverrides[key] = override;
    if (category === 'restaurant') {
      place.category_id = place.category_id || 2;
      place.category_name = place.category_name || 'Restaurant';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Restaurant' }
        : { id: 2, name: 'Restaurant', icon: '🍽️' };
    } else if (category === 'car') {
      place.category_id = place.category_id || 12;
      place.category_name = place.category_name || 'Car';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Car' }
        : { id: 12, name: 'Car', icon: '🚗' };
    } else if (category === 'store') {
      place.category_id = place.category_id || 11;
      place.category_name = place.category_name || 'Store';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Store' }
        : { id: 11, name: 'Store', icon: '🛍️' };
    }
  }
  const placesById = new Map(next.places.map((place) => [String(place.id), place]));
  if (next.assignments && typeof next.assignments === 'object') {
    next.assignments = Object.fromEntries(Object.entries(next.assignments).map(([dayId, rows]) => [
      dayId,
      (Array.isArray(rows) ? rows : []).map((row) => {
        const place = row.place && typeof row.place === 'object' ? { ...row.place } : {};
        const id = place.id || row.place_id;
        const top = placesById.get(String(id)) || {};
        const override = next.thingOverrides[`place:${id}`] || {};
        if (finiteCoord(top.lat) != null) place.lat = top.lat;
        if (finiteCoord(top.lng) != null) place.lng = top.lng;
        if (finiteCoord(override.lat) != null) place.lat = override.lat;
        if (finiteCoord(override.lng) != null) place.lng = override.lng;
        if (top.category) place.category = top.category;
        if (top.category_name) place.category_name = top.category_name;
        if (top.category_id) place.category_id = top.category_id;
        if (id && next.thingOverrides[`place:${id}`]) {
          next.thingOverrides[`place:${id}`] = { ...next.thingOverrides[`place:${id}`], timeline: true };
        }
        return { ...row, place_id: id || row.place_id, place };
      }),
    ]));
  }
  return next;
}

export function keepsakeListBuckets(shared = {}) {
  const buckets = {
    Restaurants: [],
    Stores: [],
    'Shows, Tours and the Rest': [],
    Hotels: [],
  };
  for (const place of shared.places || []) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    const row = { place, override, category };
    if (category === 'restaurant') buckets.Restaurants.push(row);
    else if (category === 'store') buckets.Stores.push(row);
    else if (category === 'hotel') buckets.Hotels.push(row);
    else if (category !== 'flight' && category !== 'car') buckets['Shows, Tours and the Rest'].push(row);
  }
  return buckets;
}
