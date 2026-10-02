import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function braveEndpoint(center) {
  return finite(center?.lat) !== null && finite(center?.lng) !== null ? 'local' : 'web';
}

export function braveQueryString(item, resolvedArea, center, compactLocality = '') {
  const target = String(item?.target || '').trim();
  const area = String(resolvedArea || '').trim();
  const locality = String(compactLocality || '').trim();
  const named = String(item?.q || '').trim();
  const local = braveEndpoint(center) === 'local';
  if (item?.intakeLodgingLookup === true && named) {
    return named.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  if (item?.targetKind === 'named_place' && target) {
    return intakeLodgingLookupQuery(target, locality).slice(0, 500);
  }
  let text = named || target || area;
  if (target && area) text = `${target} near ${area}`;
  else if (!local && named && area && !named.toLowerCase().includes(area.toLowerCase())) text = `${named} near ${area}`;
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function bravePlaceSearchRows(payload, endpoint) {
  if (endpoint !== 'local') return [];
  return Array.isArray(payload?.results) ? payload.results : [];
}

function identifierLooksLikeHttpUrl(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  try {
    const parsed = new URL(id);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function braveLocalPlaceResult(result) {
  const point = bravePoint(result);
  if (point.lat === null || point.lng === null) return false;
  if (point.lat === 0 && point.lng === 0) return false;
  const id = String(result?.id || '').trim();
  if (identifierLooksLikeHttpUrl(id)) return false;
  return true;
}

export function bravePoint(result) {
  const coords = result?.coordinates;
  if (Array.isArray(coords) && !Array.isArray(coords[0]) && coords.length >= 2) {
    return { lat: finite(coords[0]), lng: finite(coords[1]) };
  }
  if (Array.isArray(coords?.[0]) && coords[0].length >= 2) {
    return { lat: finite(coords[0][0]), lng: finite(coords[0][1]) };
  }
  const location = result?.location && typeof result.location === 'object' ? result.location : {};
  const lat = finite(result?.latitude ?? result?.lat ?? location.lat ?? location.latitude);
  const lng = finite(result?.longitude ?? result?.lng ?? location.lng ?? location.longitude);
  if (lat !== null && lng !== null) return { lat, lng };
  return { lat: null, lng: null };
}

function postalAddressParts(postal = {}) {
  const display = String(postal.displayAddress || '').trim();
  if (display) return display;
  const country = String(postal.addressCountry || postal.country || '').trim();
  return [
    postal.streetAddress,
    postal.addressLocality,
    postal.addressRegion,
    postal.postalCode,
    country,
  ].filter(Boolean).join(', ');
}

export function braveAddress(result) {
  if (typeof result?.address === 'string' && result.address.trim()) return result.address.trim();
  const postal = result?.postal_address && typeof result.postal_address === 'object'
    ? result.postal_address
    : (result?.postalAddress && typeof result.postalAddress === 'object' ? result.postalAddress : {});
  const fromPostal = postalAddressParts(postal);
  if (fromPostal) return fromPostal;
  const location = result?.location && typeof result.location === 'object' ? result.location : {};
  const fromLocation = [
    location.address,
    location.street,
    location.city,
    location.state,
    location.postcode,
    location.country,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  if (fromLocation) return fromLocation;
  return '';
}

export function trimBraveResultEvidence(result = {}) {
  const point = bravePoint(result);
  const postal = result?.postal_address && typeof result.postal_address === 'object'
    ? result.postal_address
    : (result?.postalAddress && typeof result.postalAddress === 'object' ? result.postalAddress : null);
  const location = result?.location && typeof result.location === 'object' ? result.location : null;
  const categories = Array.isArray(result?.categories)
    ? result.categories.map((item) => (typeof item === 'string' ? item : String(item?.name || item || '').trim())).filter(Boolean)
    : [];
  return {
    title: braveTitle(result?.title || result?.name),
    id: String(result?.id || '').slice(0, 200),
    categories,
    icon_category: String(result?.icon_category || '').trim() || null,
    coordinates: point.lat !== null && point.lng !== null ? [point.lat, point.lng] : null,
    postal_address: postal ? { ...postal } : null,
    address: typeof result?.address === 'string' ? result.address.trim() : null,
    location,
  };
}

export function braveCategoryName(result) {
  const direct = result?.category;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object') {
    const name = String(direct.name || direct.label || '').trim();
    if (name) return name;
  }
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  return categories.map((item) => String(item?.name || item || '').trim()).find(Boolean) || '';
}

export function braveProviderCategories(result) {
  const tags = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text) tags.push(text);
  };
  push(braveCategoryName(result));
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  for (const item of categories) push(typeof item === 'string' ? item : item?.name);
  push(result?.icon_category);
  return [...new Set(tags.filter(Boolean))];
}

export function braveTitle(value) {
  const raw = String(value || '').trim();
  const cut = raw.split(/\s+[|]\s+/)[0].trim();
  return cut || raw;
}
