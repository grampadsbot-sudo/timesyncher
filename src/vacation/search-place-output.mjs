import { enrichSearchPlace } from './trip-thing-enrichment.mjs';

const SEARCH_PRODUCT_CATEGORIES = new Set([
  'hotel',
  'event',
  'restaurant',
  'car',
  'flight',
  'store',
]);

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Normalize search/list categories to the six VK product place types. */
function searchProductCategory(category = '') {
  const cat = text(category, 80).toLowerCase();
  if (cat === 'lodging' || cat === 'accommodation') return 'hotel';
  if (cat === 'grocery' || cat === 'market' || cat === 'shopping' || cat === 'shop') return 'store';
  if (cat === 'activity' || cat === 'attraction' || cat === 'tour' || cat === 'music' || cat === 'theatre') {
    return 'event';
  }
  if (SEARCH_PRODUCT_CATEGORIES.has(cat)) return cat;
  return cat;
}

function parsePriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const direct = Number(value);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  const match = String(value).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function priceOnPlace(place = {}) {
  const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  return parsePriceValue(
    place.price
    ?? sourceRecord.price
    ?? sourceRecord.rate
    ?? sourceRecord.amount
    ?? sourceRecord.totalPrice,
  );
}

function logoOnPlace(place = {}) {
  const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  return text(place.logoUrl || sourceRecord.logoUrl || sourceRecord.logo || sourceRecord.faviconUrl);
}

/** Fail when search output is missing required product fields for a place row. */
export function searchPlaceOutputViolations(place = {}) {
  const category = searchProductCategory(place.category);
  if (!SEARCH_PRODUCT_CATEGORIES.has(category)) return [];
  const violations = [];
  const description = text(place.description);
  const summary = text(place.summary);
  const price = priceOnPlace(place);
  const logoUrl = logoOnPlace(place);
  if (!description) violations.push('blank_description');
  if (!summary) violations.push('blank_summary');
  if (summary && description && summary === description && description.length > 320) {
    violations.push('summary_equals_long_description');
  }
  if (summary && description && summary.length > 320 && description.length > 320 && summary.slice(0, 280) === description.slice(0, 280)) {
    violations.push('summary_not_short');
  }
  if (price == null) violations.push('missing_price');
  if (!logoUrl) violations.push('missing_logoUrl');
  return violations;
}

export function assertSearchPlaceOutputContract(places = []) {
  const failures = [];
  for (const place of places) {
    const violations = searchPlaceOutputViolations(place);
    if (!violations.length) continue;
    failures.push({
      title: text(place.title, 160) || '(untitled)',
      category: searchProductCategory(place.category),
      violations,
    });
  }
  if (failures.length) {
    const detail = failures
      .map((row) => `${row.category}:${row.title} → ${row.violations.join(', ')}`)
      .join('; ');
    throw new Error(`search place output contract failed: ${detail}`);
  }
}

export function finalizeSearchPlaces(places = []) {
  return (Array.isArray(places) ? places : []).map((place) => enrichSearchPlace({ ...place }));
}
