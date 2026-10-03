import { PlaceSearchError } from './place-search-error.mjs';
import {
  getNominatimStore,
  NOMINATIM_GEOCODE_CACHE_TTL_MS,
  nominatimForwardCacheKey,
  nominatimForwardPayloadCacheable,
  nominatimLabelGeocodeCacheKey,
  nominatimLabelGeocodePayloadCacheable,
  nominatimReverseCacheKey,
  nominatimReversePayloadCacheable,
  nominatimMinimumSearchLimitForCacheKey,
  nominatimSearchAliasLookupKeys,
  nominatimSearchAliasWriteKeys,
  nominatimUnwrapSearchCachePayload,
  nominatimWrapSearchCachePayload,
} from './nominatim-store.mjs';

const NOMINATIM_HOST = 'nominatim.openstreetmap.org';

export function isNominatimOpenStreetMapUrl(url) {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase();
    return host === NOMINATIM_HOST;
  } catch {
    return String(url || '').includes(NOMINATIM_HOST);
  }
}

/** Sole production entry point for HTTP to nominatim.openstreetmap.org. */
export async function nominatimHttpReadJson(fetchImpl, url, { headers, method, body, label, now } = {}) {
  if (!isNominatimOpenStreetMapUrl(url)) {
    throw new PlaceSearchError(
      `nominatimHttpReadJson requires a ${NOMINATIM_HOST} URL`,
      'nominatim_bypass',
    );
  }
  const clock = typeof now === 'function' ? now : () => (typeof now === 'number' ? now : Date.now());
  const calledAtMs = Math.trunc(Number(clock()));
  let response;
  const requestLabel = String(label || 'Nominatim').trim() || 'Nominatim';
  try {
    response = await fetchImpl(url, {
      method: method || 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'TimeSyncherVacation/1.0',
        ...(headers || {}),
      },
      body,
    });
  } catch (error) {
    const message = `${requestLabel} request failed: ${error.message || error}`;
    throw new PlaceSearchError(message, 'source_failed');
  }
  if (!response?.ok) {
    let detail = '';
    try {
      detail = typeof response.text === 'function' ? await response.text() : '';
    } catch {
      detail = '';
    }
    const httpStatus = Number(response?.status);
    const message = `${requestLabel} failed: HTTP ${response?.status || 'no status'} ${String(detail).slice(0, 300)}`.trim();
    const error = new PlaceSearchError(message, 'source_failed');
    if (Number.isFinite(httpStatus)) error.httpStatus = httpStatus;
    console.error(message);
    throw error;
  }
  try {
    const payload = await response.json();
    return { payload, calledAtMs };
  } catch (error) {
    throw new PlaceSearchError(
      `${requestLabel} returned invalid JSON: ${error.message || error}`,
      'source_failed',
    );
  }
}

/** Test helper: canonical Nominatim search URL without duplicating host literals in scripts. */
export function nominatimSelfTestSearchUrl(query = 'test') {
  return `https://${NOMINATIM_HOST}/search?format=jsonv2&q=${encodeURIComponent(query)}`;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointFrom(value) {
  const lat = finite(value?.lat ?? value?.latitude);
  const lng = finite(value?.lng ?? value?.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng, label: String(value.label || value.address || '') };
}

function httpStatusFromReason(reason) {
  const match = String(reason || '').match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

const nominatimInflightByKey = new Map();

function nominatimProviderTimingFields({
  calledAtMs,
  throttleWaitMs,
  nominatimFetchMs,
  cacheHit,
} = {}) {
  const fields = {};
  const called = Number(calledAtMs);
  if (Number.isFinite(called) && called > 0) fields.calledAtMs = called;
  const wait = Number(throttleWaitMs);
  if (Number.isFinite(wait) && wait >= 0) fields.nominatimThrottleWaitMs = wait;
  const fetchMs = Number(nominatimFetchMs);
  if (Number.isFinite(fetchMs) && fetchMs >= 0) fields.nominatimFetchMs = fetchMs;
  if (cacheHit === true) fields.cacheHit = true;
  return fields;
}

async function readCachedNominatimPayload(store, cacheKey) {
  const key = String(cacheKey || '').trim();
  if (!key) return null;
  const minLimit = nominatimMinimumSearchLimitForCacheKey(key);
  const lookupKeys = [key, ...nominatimSearchAliasLookupKeys(key)];
  for (const lookupKey of lookupKeys) {
    const raw = await store.getCachedGeocode(lookupKey);
    if (raw === null || raw === undefined) continue;
    if (minLimit == null) return raw;
    const payload = nominatimUnwrapSearchCachePayload(raw, minLimit, lookupKey);
    if (payload !== null && payload !== undefined) return payload;
  }
  return null;
}

async function writeNominatimCache(store, cacheKey, payload) {
  const key = String(cacheKey || '').trim();
  if (!key || payload === undefined) return;
  let cacheable = false;
  if (key.startsWith('forward:')) cacheable = nominatimForwardPayloadCacheable(payload);
  else if (key.startsWith('geocode:')) cacheable = nominatimLabelGeocodePayloadCacheable(payload);
  else if (key.startsWith('reverse:')) cacheable = nominatimReversePayloadCacheable(payload);
  if (!cacheable) return;
  const searchLimit = nominatimMinimumSearchLimitForCacheKey(key);
  const stored = searchLimit == null ? payload : nominatimWrapSearchCachePayload(payload, searchLimit);
  const keysToWrite = [key, ...nominatimSearchAliasWriteKeys(key)];
  for (const writeKey of keysToWrite) {
    await store.putCachedGeocode(writeKey, stored, NOMINATIM_GEOCODE_CACHE_TTL_MS);
  }
}

export function providerFailureMessage(providerLog = []) {
  return providerLog
    .map((row) => `${row.provider}: ${row.reason || row.status}`)
    .join('; ');
}

const NOMINATIM_LOCALITY_KEYS = ['city', 'town', 'village', 'hamlet', 'municipality', 'island'];

function nominatimAddress(hit) {
  return hit?.address && typeof hit.address === 'object' ? hit.address : null;
}

function nominatimLocalityName(address) {
  if (!address) return '';
  return NOMINATIM_LOCALITY_KEYS
    .map((key) => String(address[key] || '').trim())
    .find(Boolean) || '';
}

export function compactLocalityText(hit, fallback = '') {
  const address = nominatimAddress(hit);
  const place = nominatimLocalityName(address);
  if (place) return place;
  const state = String(address?.state || address?.region || '').trim();
  if (state) return state;
  const fb = String(fallback || '').trim();
  if (fb && !fb.includes(',')) return fb;
  return '';
}

export function resolvedAreaText(hit, fallback = '') {
  const address = nominatimAddress(hit);
  if (address) {
    const place = nominatimLocalityName(address);
    const county = String(address.county || '').trim();
    const state = String(address.state || address.region || '').trim();
    const country = String(address.country_code || '').trim().toUpperCase();
    const parts = [place, county, state, country].filter((part, index, all) => part && all.indexOf(part) === index);
    if (parts.length) return parts.join(', ');
  }
  const display = String(hit?.display_name || '').trim();
  return display || String(fallback || '').trim();
}

async function nominatimReadJson(fetchImpl, url, readJson, {
  env = process.env,
  cacheKey = '',
  labelQuery = '',
  sleep,
  now = Date.now,
  ...readOptions
} = {}) {
  const store = getNominatimStore(env);
  const key = String(cacheKey || '').trim();
  const cached = await readCachedNominatimPayload(store, key);
  if (cached !== null && cached !== undefined) {
    return {
      payload: cached,
      calledAtMs: null,
      cacheHit: true,
      throttleWaitMs: 0,
      nominatimFetchMs: 0,
    };
  }
  const clock = typeof now === 'function' ? now : () => now;
  const runOutbound = async () => {
    let calledAtMs = null;
    let nominatimFetchMs = 0;
    const { result: payload, throttleWaitMs } = await store.runNominatimThrottled(async () => {
      const fetchStarted = Math.trunc(Number(clock()));
      const { payload: body, calledAtMs: fetchAtMs } = await nominatimHttpReadJson(fetchImpl, url, {
        ...readOptions,
        now: clock,
      });
      const fetchEnded = Math.trunc(Number(clock()));
      calledAtMs = fetchAtMs;
      nominatimFetchMs = Math.max(0, fetchEnded - fetchStarted);
      await writeNominatimCache(store, key, body);
      return body;
    }, {
      nowMs: clock,
      sleep,
      maxWaitMs: readOptions.maxWaitMs,
    });
    return {
      payload,
      calledAtMs,
      cacheHit: false,
      throttleWaitMs: Number(throttleWaitMs) || 0,
      nominatimFetchMs,
    };
  };
  if (!key) return await runOutbound();
  let inflight = nominatimInflightByKey.get(key);
  if (!inflight) {
    const outbound = (async () => await runOutbound())();
    inflight = outbound.finally(() => {
      if (nominatimInflightByKey.get(key) === outbound) nominatimInflightByKey.delete(key);
    });
    nominatimInflightByKey.set(key, inflight);
  }
  return await inflight;
}

export async function nominatimForwardSearch(fetchImpl, query, readJson, { limit = 5, env = process.env, sleep, now } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(Math.max(limit, 1), 10)}&q=${encodeURIComponent(q)}`;
  const cacheKey = nominatimForwardCacheKey(q, limit);
  const { payload, calledAtMs } = await nominatimReadJson(fetchImpl, url, readJson, {
    label: 'Nominatim forward',
    labelQuery: q,
    env,
    cacheKey,
    sleep,
    now,
  });
  const hits = (Array.isArray(payload) ? payload : []).slice(0, limit);
  return { hits, calledAtMs };
}

export async function nominatimReverseGeocode(fetchImpl, lat, lng, readJson, { env = process.env, sleep, now } = {}) {
  const pointLat = finite(lat);
  const pointLng = finite(lng);
  if (pointLat === null || pointLng === null) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pointLat}&lon=${pointLng}`;
  const cacheKey = nominatimReverseCacheKey(pointLat, pointLng);
  const { payload, calledAtMs } = await nominatimReadJson(fetchImpl, url, readJson, {
    label: 'Nominatim reverse',
    env,
    cacheKey,
    sleep,
    now,
  });
  if (!payload || typeof payload !== 'object') return { reversed: null, calledAtMs };
  const address = String(payload.display_name || '').trim();
  if (!address) return { reversed: null, calledAtMs };
  return {
    reversed: {
      address,
      hit: payload,
      lat: finite(payload.lat) ?? pointLat,
      lng: finite(payload.lon ?? payload.lng) ?? pointLng,
    },
    calledAtMs,
  };
}

async function geocodeLabel(fetchImpl, label, readJson, options = {}) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(label)}`;
  const cacheKey = nominatimLabelGeocodeCacheKey(label);
  const {
    payload,
    calledAtMs,
    throttleWaitMs,
    nominatimFetchMs,
    cacheHit,
  } = await nominatimReadJson(fetchImpl, url, readJson, {
    label: 'Nominatim geocode',
    labelQuery: label,
    env: options.env,
    cacheKey,
    sleep: options.sleep,
    now: options.now,
  });
  const hit = Array.isArray(payload) ? payload[0] : null;
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon ?? hit?.lng);
  if (lat === null || lng === null) {
    return {
      found: null,
      calledAtMs,
      throttleWaitMs,
      nominatimFetchMs,
      cacheHit,
    };
  }
  return {
    found: {
      lat,
      lng,
      label: resolvedAreaText(hit, label),
      compactLocality: compactLocalityText(hit, label),
    },
    calledAtMs,
    throttleWaitMs,
    nominatimFetchMs,
    cacheHit,
  };
}

export async function tryGeocodeLabel(fetchImpl, label, providerLog, readJson, options = {}) {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    providerLog.push({ provider: 'nominatim', status: 'skipped', reason: 'no_label', resultCount: 0 });
    return null;
  }
  try {
    const {
      found,
      calledAtMs,
      throttleWaitMs,
      nominatimFetchMs,
      cacheHit,
    } = await geocodeLabel(fetchImpl, trimmed, readJson, options);
    if (!found) {
      providerLog.push({
        provider: 'nominatim',
        status: 'empty',
        reason: `no coordinates for ${trimmed}`,
        resultCount: 0,
        ...nominatimProviderTimingFields({
          calledAtMs,
          throttleWaitMs,
          nominatimFetchMs,
          cacheHit,
        }),
      });
      return null;
    }
    providerLog.push({
      provider: 'nominatim',
      status: 'ok',
      resultCount: 1,
      ...nominatimProviderTimingFields({
        calledAtMs,
        throttleWaitMs,
        nominatimFetchMs,
        cacheHit,
      }),
    });
    return found;
  } catch (error) {
    const reason = String(error?.message || error || 'geocode failed').trim();
    const httpStatus = Number.isFinite(Number(error?.httpStatus))
      ? Number(error.httpStatus)
      : httpStatusFromReason(reason);
    providerLog.push({
      provider: 'nominatim',
      status: 'error',
      reason,
      ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
      resultCount: 0,
    });
    return null;
  }
}

export async function resolveSearchContext(
  fetchImpl,
  { lodging, lodgingPoint, destination, keepAreaText = false, tripDestinationCenter = null },
  providerLog,
  readJson,
  fail,
  options = {},
) {
  const given = pointFrom(lodgingPoint);
  const storedCenter = pointFrom(tripDestinationCenter);
  const lodgingLabel = String(lodging || '').trim();
  const destinationLabel = String(destination || '').trim();
  if (given) {
    providerLog.push({ provider: 'nominatim', status: 'skipped', reason: 'lodging_coordinates', resultCount: 0 });
    return {
      center: { ...given, geocoded: 'lodging' },
      locationText: lodgingLabel || destinationLabel || given.label || '',
      compactLocality: compactLocalityText(null, lodgingLabel || destinationLabel || given.label || ''),
    };
  }
  if (lodgingLabel) {
    const found = await tryGeocodeLabel(fetchImpl, lodgingLabel, providerLog, readJson, options);
    if (found) {
      return {
        center: { ...found, geocoded: 'lodging' },
        locationText: lodgingLabel,
        compactLocality: found.compactLocality || compactLocalityText(null, lodgingLabel),
      };
    }
    console.error(`Nominatim returned no coordinates for lodging "${lodgingLabel}".`);
  }
  if (!destinationLabel && !lodgingLabel) {
    fail('Place search needs a destination.', 'missing_destination');
  }
  if (destinationLabel && storedCenter && !lodgingLabel) {
    providerLog.push({
      provider: 'nominatim',
      status: 'skipped',
      reason: 'trip_destination_center',
      resultCount: 0,
    });
    const locationText = keepAreaText ? destinationLabel : (storedCenter.label || destinationLabel);
    return {
      center: { ...storedCenter, geocoded: 'stored' },
      locationText,
      compactLocality: compactLocalityText(null, destinationLabel),
    };
  }
  if (destinationLabel) {
    const found = await tryGeocodeLabel(fetchImpl, destinationLabel, providerLog, readJson, options);
    if (found) {
      const locationText = keepAreaText ? destinationLabel : (found.label || destinationLabel);
      return {
        center: { ...found, geocoded: 'destination' },
        locationText,
        compactLocality: found.compactLocality || compactLocalityText(null, destinationLabel),
      };
    }
  }
  const locationText = lodgingLabel || destinationLabel;
  if (!locationText) fail('Place search needs a destination.', 'missing_destination');
  return {
    center: null,
    locationText,
    compactLocality: compactLocalityText(null, locationText),
  };
}
