import { productThingCategory } from './keepsake-product-overrides.mjs';

const THING_TITLE_SLASH_ALLOWLIST_IDS = new Set(['663']);

const GENERIC_CATEGORY_TITLE = /\b(guided\s+walking\/audio\s+history\s+tours)\b/i;

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function thingTitleSlashSegments(title = '') {
  return text(title).split(/\s\/\s/).filter(Boolean);
}

export function thingTitleStandInReason(title = '', placeId = null) {
  const normalized = text(title);
  if (!normalized) return null;
  if (THING_TITLE_SLASH_ALLOWLIST_IDS.has(String(placeId))) return null;
  const segments = thingTitleSlashSegments(normalized);
  if (segments.length >= 3) return 'title_bundle_slash';
  if (GENERIC_CATEGORY_TITLE.test(normalized)) return 'title_generic_category';
  return null;
}

export function thingAddressStreetReason(address = '', category = '') {
  const cat = text(category).toLowerCase();
  if (['flight', 'car', 'hotel'].includes(cat)) return null;
  const addr = text(address);
  if (!addr) return 'address_missing';
  if (/^\d{1,5}\b/.test(addr)) return null;
  if (
    /\b\d{1,5}\s+(?:[NSEW]\s+)?[\w'.-]+(?:\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Broadway|Rd|Road|Way|Pl|Place|Dr|Drive|Cir|Circle))\b/i.test(
      addr,
    )
  ) {
    return null;
  }
  return 'address_neighborhood_only';
}

const TRIP99_STANDIN_ADDRESS_PLACE_IDS = new Set(['664', '669', '672']);

export function assessThingStandInPresentation(place = {}, override = {}, options = {}) {
  const merged = { ...place, ...override };
  const category = productThingCategory(place, override);
  const title = text(merged.name || merged.title || place.name || place.title);
  const address = text(merged.address || place.address);
  const placeId = String(place.id ?? '');
  const reasons = [];

  const titleReason = thingTitleStandInReason(title, placeId);
  if (titleReason) reasons.push(titleReason);

  const enforceAddress =
    options.enforceAddress === true
    || (options.enforceAddress !== false && TRIP99_STANDIN_ADDRESS_PLACE_IDS.has(placeId));
  if (enforceAddress) {
    const addressReason = thingAddressStreetReason(address, category);
    if (addressReason) reasons.push(addressReason);
  }

  return {
    pass: reasons.length === 0,
    placeId: place.id,
    title,
    address,
    category,
    reasons,
  };
}

export function scanTripThingStandIns(shared = {}, options = {}) {
  const tripId = Number(shared.trip?.id ?? options.tripId ?? 0);
  if (options.tripId != null && tripId !== Number(options.tripId)) {
    return { pass: true, failures: [], tripId };
  }
  const failures = [];
  for (const place of shared.places || []) {
    if (!place || place.id == null) continue;
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    if (['hotel', 'flight', 'car'].includes(category)) continue;
    const row = assessThingStandInPresentation(place, override, options);
    if (!row.pass) {
      failures.push({
        id: place.id,
        name: row.title,
        category: row.category,
        reason: row.reasons[0],
        reasons: row.reasons,
        address: row.address,
      });
    }
  }
  return { pass: failures.length === 0, failures, tripId };
}
