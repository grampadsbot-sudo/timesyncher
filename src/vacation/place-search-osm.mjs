import { categoryRadiusMeters } from './keepsake-list-minimums.mjs';
import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

const OSM_CATEGORIES = [
  {
    category: 'grocery',
    filter: '["shop"~"supermarket|grocery|convenience|greengrocer"]',
    match: (tags) => /^(?:supermarket|grocery|convenience|greengrocer)$/.test(String(tags.shop || '')),
    name: (tags) => String(tags.shop || '').trim(),
  },
  {
    category: 'grocery',
    filter: '["amenity"="marketplace"]',
    match: (tags) => String(tags.amenity || '').trim().toLowerCase() === 'marketplace',
    name: (tags) => String(tags.amenity || '').trim(),
  },
  {
    category: 'restaurant',
    filter: '["amenity"~"restaurant|cafe|fast_food"]',
    match: (tags) => /restaurant|cafe|fast_food/.test(String(tags.amenity || '')),
    name: (tags) => String(tags.amenity || '').trim(),
  },
  {
    category: 'store',
    filter: '["shop"]',
    match: (tags) => Boolean(tags.shop),
    name: (tags) => String(tags.shop || '').trim(),
  },
  {
    category: 'garden',
    filter: '["leisure"="garden"]',
    match: (tags) => String(tags.leisure || '') === 'garden' || String(tags.tourism || '') === 'garden',
    name: () => 'garden',
  },
  {
    category: 'activity',
    filter: '["tourism"~"attraction|museum|gallery|viewpoint"]',
    match: (tags) => Boolean(tags.tourism),
    name: (tags) => String(tags.tourism || '').trim(),
  },
];

function osmFail(message, code) {
  throw new PlaceSearchError(message, code);
}

function osmCategoriesForPlaceSearch(categoryFilter = null) {
  const wanted = [...new Set(
    (Array.isArray(categoryFilter) ? categoryFilter : [])
      .map((c) => normalizePlaceSearchCategory(c))
      .filter(Boolean),
  )];
  if (!wanted.length) {
    osmFail('Place search refused: classifier place category missing.', 'missing_place_category');
  }
  const filtered = OSM_CATEGORIES.filter((entry) => wanted.includes(entry.category));
  const unknown = wanted.filter((cat) => !filtered.some((entry) => entry.category === cat));
  if (unknown.length) {
    osmFail(`Place search refused: unknown place category ${unknown.join(', ')}.`, 'unknown_place_category');
  }
  return filtered;
}

export function overpassQuery(center, categoryFilter = null) {
  const parts = [];
  for (const entry of osmCategoriesForPlaceSearch(categoryFilter)) {
    const around = `(around:${categoryRadiusMeters(entry.category)},${center.lat},${center.lng})`;
    parts.push(`node${entry.filter}${around};`, `way${entry.filter}${around};`);
  }
  return `[out:json][timeout:25];(${parts.join('')});out center 40;`;
}

function categoryNameField(name) {
  const categoryName = String(name || '').trim();
  return categoryName ? { categoryName } : {};
}

function osmCategory(tags = {}) {
  const found = OSM_CATEGORIES.find((entry) => entry.match(tags));
  return found ? found.category : '';
}

function osmCategoryName(tags = {}) {
  const found = OSM_CATEGORIES.find((entry) => entry.match(tags));
  return found ? found.name(tags) : '';
}

const OSM_POI_ROOT_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'natural'];

function osmHasBusinessPoiTag(tags = {}) {
  for (const key of OSM_POI_ROOT_KEYS) {
    const value = String(tags[key] || '').trim();
    if (!value) continue;
    if (key === 'leisure' && value.toLowerCase() === 'slipway') continue;
    return true;
  }
  return false;
}

/** Structural gate: only named OSM POIs, not highways, junctions, or generic access features. */
export function osmPlaceQualifiesForSave(tags = {}) {
  const title = String(tags.name || '').trim();
  if (!title) return false;
  if (String(tags.highway || '').trim()) return false;
  if (String(tags.junction || '').trim()) return false;
  if (String(tags.crossing || '').trim()) return false;
  if (String(tags.leisure || '').trim().toLowerCase() === 'slipway') return false;
  if (String(tags.bridge || '').trim() && !osmHasBusinessPoiTag(tags)) return false;
  const entrance = String(tags.entrance || '').trim();
  if (entrance && !osmHasBusinessPoiTag(tags)) return false;
  const access = String(tags.access || '').trim();
  if (access && !osmHasBusinessPoiTag(tags)) return false;
  return osmHasBusinessPoiTag(tags);
}

export function placesFromOsmPayload(payload, center, { finite, metersInsideCategory, ratingFromRecord }) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const places = [];
  for (const element of elements) {
    const tags = element?.tags || {};
    if (!osmPlaceQualifiesForSave(tags)) continue;
    const title = String(tags.name || '').trim();
    const category = osmCategory(tags);
    const lat = finite(element?.lat ?? element?.center?.lat);
    const lng = finite(element?.lon ?? element?.center?.lon);
    if (!title || !category || lat === null || lng === null) continue;
    if (metersInsideCategory(center, { lat, lng }, category) === null) continue;
    places.push({
      source: 'osm',
      title,
      category,
      lat,
      lng,
      address: String(tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ')),
      url: element.type && element.id ? `https://www.openstreetmap.org/${element.type}/${element.id}` : '',
      externalId: element.type && element.id ? `${element.type}/${element.id}` : '',
      ...ratingFromRecord(tags),
      ...categoryNameField(osmCategoryName(tags)),
    });
  }
  return places;
}
