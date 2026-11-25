import {
  VK_SEARCH_BOT_ID,
  VK_SEARCH_PROVIDER,
  loadVkSearchCensusResult,
  vkSearchResultToDossier,
} from './dossier-vk-search.mjs';
import { nominatimForwardSearch, nominatimReverseGeocode } from './place-search-geocode.mjs';
import { distanceMeters } from './place-search-same-place.mjs';
import {
  ANCHOR_RADIUS_SCOPE_DESTINATION,
  ANCHOR_RADIUS_SCOPE_LODGING,
  radiusMetersForAnchorScope,
} from './place-search-radius-filter.mjs';
import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { placePersistCategory } from './intake-car-category.mjs';

const STREET_ADDRESS_RE = /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Ln|Lane|Pkwy|Parkway|Pl|Place|Ct|Court|Cir|Circle|Hwy|Highway|Ter|Terrace|Square|Sq|Loop|Trail|Trl)\.?(?:,\s*[A-Za-z.'-]+(?:\s+[A-Za-z.'-]+){0,3}){1,2},\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/;
const LABELED_ADDRESS_RE = /\bAddress\s*:\s*([^\n;|]{10,160})/i;

function text(value, max = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function publicHttpUrl(value) {
  try {
    const parsed = new URL(text(value, 1000));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function validCoords(lat, lng) {
  const la = finite(lat);
  const lo = finite(lng);
  if (la === null || lo === null) return null;
  if (la === 0 && lo === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lng: lo };
}

function extractCoords(row = {}) {
  if (Array.isArray(row?.coordinates) && row.coordinates.length >= 2) {
    const pair = Array.isArray(row.coordinates[0]) ? row.coordinates[0] : row.coordinates;
    const found = validCoords(pair[0], pair[1]);
    if (found) return found;
  }
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const fields = row?.fields && typeof row.fields === 'object' ? row.fields : {};
  const record = row?.sourceRecord && typeof row.sourceRecord === 'object' ? row.sourceRecord : {};
  return validCoords(row?.lat ?? row?.latitude, row?.lng ?? row?.lon ?? row?.longitude)
    || validCoords(loc.lat ?? loc.latitude, loc.lng ?? loc.lon ?? loc.longitude)
    || validCoords(fields.lat?.value ?? fields.lat, fields.lng?.value ?? fields.lng)
    || validCoords(record.lat ?? record.latitude, record.lng ?? record.lon ?? record.longitude);
}

function postalAddressText(postal = {}) {
  if (!postal || typeof postal !== 'object') return '';
  const display = text(postal.displayAddress || postal.formatted, 300);
  if (display) return display;
  return [
    postal.streetAddress || postal.street,
    postal.addressLocality || postal.city,
    postal.addressRegion || postal.state,
    postal.postalCode || postal.postcode,
    postal.addressCountry || postal.country,
  ].map((part) => text(part, 120)).filter(Boolean).join(', ');
}

function extractAddressFromSources(sources = []) {
  for (const src of Array.isArray(sources) ? sources : []) {
    if (!publicHttpUrl(src?.url)) continue;
    const blob = [src?.text, src?.snippet].map((part) => String(part || '')).join('\n');
    const labeled = blob.match(LABELED_ADDRESS_RE);
    if (labeled && /\d/.test(labeled[1])) return text(labeled[1], 240);
    const street = blob.match(STREET_ADDRESS_RE);
    if (street) return text(street[0], 240);
  }
  return '';
}

function extractSourcedAddress(row = {}) {
  const fields = row?.fields && typeof row.fields === 'object' ? row.fields : {};
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const record = row?.sourceRecord && typeof row.sourceRecord === 'object' ? row.sourceRecord : {};
  const direct = [
    typeof row?.address === 'string' ? row.address : '',
    typeof loc.address === 'string' ? loc.address : '',
    typeof fields.address === 'string' ? fields.address : fields.address?.value,
    postalAddressText(row?.postal_address || row?.postalAddress || row?.address),
    postalAddressText(loc),
    typeof record.address === 'string' ? record.address : '',
  ].map((part) => text(part, 300)).find(Boolean);
  if (direct) return direct;
  return extractAddressFromSources(row?.sources);
}

function extractEvidenceUrl(row = {}) {
  const record = row?.sourceRecord && typeof row.sourceRecord === 'object' ? row.sourceRecord : {};
  const prov = row?.identityProvenance || record.identityProvenance || {};
  const direct = [
    prov.evidenceUrl,
    row?.evidenceUrl,
    row?.url,
    row?.website,
    record.url,
    record.website,
  ].map(publicHttpUrl).find(Boolean);
  if (direct) return direct;
  for (const src of Array.isArray(row?.sources) ? row.sources : []) {
    const candidate = publicHttpUrl(src?.url);
    if (candidate) return candidate;
  }
  return '';
}

const APP_CATEGORIES = new Set(['hotel', 'restaurant', 'activity', 'store', 'grocery', 'market', 'garden', 'car', 'flight']);

function normalizedCategory(row = {}, fallback = '') {
  const raw = text(row?.category || row?.type || row?.sourceRecord?.category, 80).toLowerCase();
  if (/hotel|lodg|resort|inn|motel|stay/.test(raw)) return 'hotel';
  if (/car_rental|car rental/.test(raw)) return 'car';
  if (APP_CATEGORIES.has(raw)) return raw;
  const fb = text(fallback, 80).toLowerCase();
  if (APP_CATEGORIES.has(fb)) return fb;
  if (/cafe|café|coffee|restaurant|dining|food|bar|bistro|bakery/.test(raw)) return 'restaurant';
  return fb || 'activity';
}

function providerCategoriesFor(row = {}, category = '') {
  const tags = [];
  const push = (val) => {
    const clean = text(val, 80);
    if (clean) tags.push(clean);
  };
  if (category === 'hotel') push('lodging');
  if (category === 'car') push('car_rental');
  for (const item of Array.isArray(row?.providerCategories) ? row.providerCategories : []) push(item);
  for (const item of Array.isArray(row?.categories) ? row.categories : []) {
    push(typeof item === 'string' ? item : item?.name);
  }
  push(row?.categoryName);
  push(row?.icon_category);
  return [...new Set(tags)];
}

function extractEnrichedFields(row = {}, place = {}) {
  const record = row?.sourceRecord && typeof row.sourceRecord === 'object' ? row.sourceRecord : {};
  const fields = row?.fields && typeof row.fields === 'object' ? row.fields : {};
  const dossier = Array.isArray(row?.sources) && row.sources.length ? vkSearchResultToDossier(row, place) : null;
  const summary = text(row?.summary ?? fields.summary?.value ?? fields.summary ?? dossier?.fields?.summary?.value ?? record.summary, 2000);
  const description = text(row?.description ?? fields.description?.value ?? fields.description ?? dossier?.fields?.description?.value ?? record.description, 4000);
  const rawPrice = row?.price ?? fields.price?.value ?? fields.price ?? record.price;
  const parsedPrice = finite(rawPrice);
  const price = parsedPrice !== null && parsedPrice > 0 ? Math.round(parsedPrice) : null;
  const logoUrl = publicHttpUrl(row?.logoUrl || row?.logo || row?.faviconUrl || record.logoUrl || record.logo || record.faviconUrl);

  const extraRecord = {};
  const copyKeys = [
    'googleRating', 'yelpRating', 'thirdPartyRating', 'ratingCount',
    'googleReviewCount', 'yelpReviewCount', 'thirdPartyReviewCount',
    'ratingMix', 'reviewThemes', 'xaiRatingsFetched', 'reviewsLabel',
    'reviewsRepresentative', 'provenanceBlocked', 'provenanceBlocker',
    'hours', 'phone', 'neighborhood', 'itineraryNote', 'icon_category', 'categories', 'categoryName',
  ];
  for (const key of copyKeys) {
    const val = row?.[key] ?? record[key];
    if (val !== undefined && val !== null && val !== '') extraRecord[key] = val;
  }
  for (let i = 1; i <= 4; i += 1) {
    for (const suffix of ['', 'Source', 'Rating', 'Url', 'Theme']) {
      const key = `review${i}${suffix}`;
      const val = row?.[key] ?? record[key];
      if (val !== undefined && val !== null && val !== '') extraRecord[key] = val;
    }
  }
  if (!extraRecord.googleRating && !extraRecord.yelpRating && !extraRecord.thirdPartyRating) {
    const ratingVal = finite(row?.rating?.primary ?? row?.rating?.ratingValue ?? row?.rating ?? dossier?.rating);
    const primarySrc = text(row?.rating?.primarySource, 40).toLowerCase();
    if (ratingVal !== null && ratingVal > 0) {
      if (primarySrc === 'yelp') extraRecord.yelpRating = String(ratingVal);
      else if (primarySrc === 'google') extraRecord.googleRating = String(ratingVal);
      else extraRecord.thirdPartyRating = String(ratingVal);
    }
  }
  if (extraRecord.ratingCount == null) {
    const countVal = finite(
      row?.rating?.reviewCount
      ?? row?.reviewCount?.google
      ?? row?.reviewCount?.yelp
      ?? row?.reviewCount?.tripadvisor
      ?? row?.reviewCount?.tripcom
      ?? dossier?.reviewsAvailable,
    );
    if (countVal !== null && countVal >= 0) extraRecord.ratingCount = Math.floor(countVal);
  }
  if (dossier?.pages?.length && !extraRecord.evidenceDossier) {
    extraRecord.evidenceDossier = dossier;
  }
  return {
    ...(summary ? { summary } : {}),
    ...(description ? { description } : {}),
    ...(price !== null ? { price } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    extraRecord,
  };
}

export async function resolveVkSearchPlaceIdentity(result = {}, {
  place = {},
  category = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  providerRank = 0,
} = {}) {
  if (!result || typeof result !== 'object') return { ok: false, reason: 'empty_result', place: null };
  const evidenceUrl = extractEvidenceUrl(result);
  if (!evidenceUrl) return { ok: false, reason: 'no_evidence_url', place: null };
  const prov = result.identityProvenance || result.sourceRecord?.identityProvenance || {};
  const title = text(prov.approvedDisplayTitle || result.thingName || result.title || result.name || place?.title || place?.name, 240);
  if (!title) return { ok: false, reason: 'no_title', place: null };
  const externalId = text(prov.ccabKey || result.externalId || result.ccabKey || result.id || result.thingId || title, 240);
  let address = extractSourcedAddress(result);
  let coords = extractCoords(result);
  let addressSource = address ? VK_SEARCH_PROVIDER : '';
  let coordsSource = coords ? VK_SEARCH_PROVIDER : '';

  if (address && !coords && fetchImpl) {
    try {
      const { hits } = await nominatimForwardSearch(fetchImpl, address, null, { limit: 1, env });
      const first = Array.isArray(hits) ? hits[0] : null;
      const geocoded = validCoords(first?.lat, first?.lon ?? first?.lng);
      if (geocoded) {
        coords = geocoded;
        coordsSource = 'nominatim_geocode';
      }
    } catch {
      coords = null;
    }
  } else if (coords && !address && fetchImpl) {
    try {
      const rev = await nominatimReverseGeocode(fetchImpl, coords.lat, coords.lng, null, { env });
      const reversedAddr = text(rev?.reversed?.address, 300);
      if (reversedAddr) {
        address = reversedAddr;
        addressSource = 'nominatim_reverse';
      }
    } catch {
      address = '';
    }
  }

  if (!coords && !address) return { ok: false, reason: 'no_address_or_coordinates', place: null };
  if (!coords) return { ok: false, reason: 'no_coordinates', place: null };
  if (!address) return { ok: false, reason: 'no_address', place: null };

  const resolvedCategory = normalizedCategory(result, category || place?.category);
  const categoryName = text(result.categoryName || result.sourceRecord?.categoryName || (result.category && result.category !== resolvedCategory ? result.category : ''), 80);
  const providerCategories = providerCategoriesFor(result, resolvedCategory);
  const enriched = extractEnrichedFields(result, { ...place, title, category: resolvedCategory });
  const identityProvenance = {
    approvedDisplayTitle: title,
    ccabKey: externalId,
    evidenceUrl,
    botId: VK_SEARCH_BOT_ID,
    source: VK_SEARCH_PROVIDER,
  };
  const sourceRecord = {
    ...enriched.extraRecord,
    source: VK_SEARCH_PROVIDER,
    url: evidenceUrl,
    lat: coords.lat,
    lng: coords.lng,
    address,
    addressSource,
    coordsSource,
    ...(categoryName ? { categoryName } : {}),
    ...(enriched.price != null ? { price: enriched.price } : {}),
    ...(enriched.logoUrl ? { logoUrl: enriched.logoUrl } : {}),
    ...(providerCategories.length ? { providerCategories } : {}),
    identityProvenance,
  };
  const persistedCategory = placePersistCategory({
    source: VK_SEARCH_PROVIDER,
    category: resolvedCategory,
    sourceRecord,
    providerCategories,
  });
  const resolvedPlace = {
    source: VK_SEARCH_PROVIDER,
    title,
    category: persistedCategory,
    ...(categoryName ? { categoryName } : {}),
    lat: coords.lat,
    lng: coords.lng,
    address,
    url: evidenceUrl,
    externalId,
    providerRank,
    addressSource,
    coordsSource,
    ...(enriched.summary ? { summary: enriched.summary } : {}),
    ...(enriched.description ? { description: enriched.description } : {}),
    ...(enriched.price != null ? { price: enriched.price } : {}),
    ...(enriched.logoUrl ? { logoUrl: enriched.logoUrl } : {}),
    ...(providerCategories.length ? { providerCategories } : {}),
    sourceRecord,
  };
  return { ok: true, reason: null, place: resolvedPlace };
}

export function vkSearchQueryString(item = {}, resolvedArea = '', compactLocality = '') {
  const target = text(item?.target || item?.propertyName, 180);
  const locality = text(compactLocality || item?.areaHint || resolvedArea, 180);
  const named = text(item?.q, 240);
  if (item?.intakeLodgingLookup === true && named) return named;
  if (item?.targetKind === 'named_place' && target) {
    return intakeLodgingLookupQuery(target, locality);
  }
  const base = named || target || locality;
  if (target && locality && !base.toLowerCase().includes(locality.toLowerCase())) {
    return intakeLodgingLookupQuery(target, locality);
  }
  return base;
}

async function fetchVkSearchPayload(placeRequest, { env = process.env, fetchImpl = globalThis.fetch, vkSearchImpl } = {}) {
  if (typeof vkSearchImpl === 'function') {
    return { configured: true, payload: await vkSearchImpl(placeRequest, { env, fetchImpl }) };
  }
  const wakeUrl = text(env?.VK_SEARCH_WAKE_URL, 1000);
  if (wakeUrl) {
    const response = await fetchImpl(wakeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ botId: VK_SEARCH_BOT_ID, place: placeRequest }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response?.ok) {
      const err = new Error(`VK Search failed: HTTP ${Number(response?.status) || 0}`);
      err.httpStatus = Number(response?.status) || 0;
      throw err;
    }
    return { configured: true, payload: await response.json() };
  }
  const census = loadVkSearchCensusResult(placeRequest, { env });
  if (census) return { configured: true, payload: census };
  return { configured: false, payload: null };
}

function candidateRowsFromVkPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.places)) return payload.places;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  if (Array.isArray(payload.results)) return payload.results;
  return [payload];
}

export function preferVkUrlDuplicates(rows = []) {
  const byUrl = new Map();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = text(row?.url, 600).toLowerCase().replace(/\/+$/, '');
    if (!key) {
      out.push(row);
      continue;
    }
    const prevIdx = byUrl.get(key);
    if (prevIdx == null) {
      byUrl.set(key, out.length);
      out.push(row);
      continue;
    }
    const prev = out[prevIdx];
    const prevRank = Number.isFinite(Number(prev?.providerRank)) ? Number(prev.providerRank) : 999;
    const rowRank = Number.isFinite(Number(row?.providerRank)) ? Number(row.providerRank) : 999;
    if (rowRank < prevRank || (rowRank === prevRank && String(row?.title || '').length < String(prev?.title || '').length)) {
      out[prevIdx] = row;
    }
  }
  return out;
}

export async function queryVkSearchPlaces(fetchImpl, env = process.env, {
  center = null,
  locationText = '',
  compactLocality = '',
  namedPlaceLookup = false,
  vkSearchImpl = null,
} = {}, queries = []) {
  const area = text(locationText || center?.label, 240);
  const locality = text(compactLocality || center?.compactLocality || area, 180);
  const radiusScope = namedPlaceLookup ? ANCHOR_RADIUS_SCOPE_DESTINATION : ANCHOR_RADIUS_SCOPE_LODGING;
  const places = [];
  const rawResults = [];
  const lookups = [];
  const unresolvedReasons = [];
  let anchorRadiusRejected = 0;
  const anchorRadiusRejections = [];
  let anyConfigured = false;

  for (const item of Array.isArray(queries) ? queries : []) {
    const query = vkSearchQueryString(item, area, locality);
    if (!query) continue;
    lookups.push({ query, endpoint: VK_SEARCH_PROVIDER });
    const placeRequest = {
      id: item.id ?? item.placeId ?? item.rowId,
      title: text(item.propertyName || item.target || item.q, 240),
      name: text(item.propertyName || item.target || item.q, 240),
      category: text(item.category, 80) || 'activity',
      area: text(item.areaHint || locality || area, 180),
      destination: area,
      query,
      ...(center && validCoords(center.lat, center.lng) ? { center: { lat: Number(center.lat), lng: Number(center.lng) } } : {}),
      requestedFields: [
        'title', 'address', 'lat', 'lng', 'externalId', 'url', 'sources',
        'summary', 'description', 'price', 'logoUrl', 'rating', 'reviewCount', 'reviews',
      ],
    };
    const { configured, payload } = await fetchVkSearchPayload(placeRequest, { env, fetchImpl, vkSearchImpl });
    if (!configured) continue;
    anyConfigured = true;
    const rows = candidateRowsFromVkPayload(payload);
    for (let rank = 0; rank < rows.length; rank += 1) {
      const row = rows[rank];
      if (rawResults.length < 5 && row && typeof row === 'object') {
        rawResults.push({
          title: text(row.thingName || row.title || row.name, 200),
          url: extractEvidenceUrl(row) || null,
          address: extractSourcedAddress(row) || null,
          coordinates: (() => {
            const c = extractCoords(row);
            return c ? [c.lat, c.lng] : null;
          })(),
        });
      }
      const outcome = await resolveVkSearchPlaceIdentity(row, {
        place: placeRequest,
        category: item.category,
        env,
        fetchImpl,
        providerRank: rank,
      });
      if (!outcome.ok || !outcome.place) {
        if (outcome.reason) unresolvedReasons.push(outcome.reason);
        continue;
      }
      const resolved = outcome.place;
      if (center && validCoords(center.lat, center.lng)) {
        const limitMeters = radiusMetersForAnchorScope(item.category || resolved.category, radiusScope);
        const meters = distanceMeters(center, resolved);
        if (meters === null || meters > limitMeters) {
          anchorRadiusRejected += 1;
          anchorRadiusRejections.push({
            title: resolved.title,
            source: VK_SEARCH_PROVIDER,
            lat: resolved.lat,
            lng: resolved.lng,
            meters,
            limitMeters,
            scope: radiusScope,
            reason: 'outside_radius',
          });
          continue;
        }
      }
      places.push(resolved);
    }
  }

  return {
    places: preferVkUrlDuplicates(places),
    rawResults,
    lookups,
    unresolvedReasons,
    query: lookups.map((row) => row.query).filter(Boolean).join(' | '),
    ...(anyConfigured ? {} : { skipped: 'vk_search_not_configured' }),
    ...(anchorRadiusRejected > 0 ? { anchorRadiusRejected } : {}),
    ...(anchorRadiusRejections.length ? { anchorRadiusRejections } : {}),
  };
}
