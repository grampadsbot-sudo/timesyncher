import { hasDatabase, sql } from './db.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

export const NOMINATIM_GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOMINATIM_THROTTLE_INTERVAL_MS = 1000;
const NOMINATIM_THROTTLE_MAX_WAIT_MS = 45_000;

let storeOverride = null;
let postgresStoreClient = null;

export function useNominatimStore(store) {
  storeOverride = store || null;
  if (!store) postgresStoreClient = null;
}

function normalizeNominatimQuery(query) {
  return String(query || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function nominatimGeocodeCacheKey(kind, normalizedQuery) {
  const kindText = String(kind || '').trim();
  const queryText = String(normalizedQuery || '').trim();
  if (!kindText || !queryText) return '';
  return `${kindText}:${queryText}`;
}

export function nominatimReverseCacheKey(lat, lng) {
  const pointLat = Number(lat);
  const pointLng = Number(lng);
  if (!Number.isFinite(pointLat) || !Number.isFinite(pointLng)) return '';
  return nominatimGeocodeCacheKey('reverse', `${pointLat.toFixed(6)},${pointLng.toFixed(6)}`);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseNominatimGeocodeCachePayload(raw) {
  if (raw === undefined || raw === null) return null;
  let payload = raw;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      throw new PlaceSearchError(
        `Nominatim geocode cache payload is not valid JSON: ${error.message}`,
        'nominatim_geocode_cache_corrupt',
      );
    }
  }
  const kind = typeof payload;
  if (kind !== 'object' || payload === null) {
    throw new PlaceSearchError(
      'Nominatim geocode cache payload must be a JSON object or array',
      'nominatim_geocode_cache_corrupt',
    );
  }
  return payload;
}

function createPostgresNominatimStore(env) {
  const db = sql(env);
  let outboundChain = Promise.resolve();
  return {
    async getCachedGeocode(cacheKey) {
      const key = String(cacheKey || '').trim();
      if (!key) return null;
      const rows = await db`
        select payload
        from nominatim_geocode_cache
        where cache_key = ${key}
          and expires_at > now()
        limit 1
      `;
      const raw = rows?.[0]?.payload;
      if (raw === undefined || raw === null) return null;
      return parseNominatimGeocodeCachePayload(raw);
    },
    async putCachedGeocode(cacheKey, payload, ttlMs = NOMINATIM_GEOCODE_CACHE_TTL_MS) {
      const key = String(cacheKey || '').trim();
      if (!key || payload === undefined) return;
      const ttl = Math.max(Number(ttlMs) || 0, 1);
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      await db`
        insert into nominatim_geocode_cache (cache_key, payload, expires_at)
        values (${key}, ${JSON.stringify(payload)}::jsonb, ${expiresAt}::timestamptz)
        on conflict (cache_key) do update
        set payload = excluded.payload,
            expires_at = excluded.expires_at
      `;
    },
    async reserveNominatimSlot(options = {}) {
      await this.runNominatimThrottled(async () => {}, options);
    },
    async runNominatimThrottled(work, {
      nowMs = Date.now(),
      maxWaitMs = NOMINATIM_THROTTLE_MAX_WAIT_MS,
      sleep = defaultSleep,
    } = {}) {
      let release;
      const prior = outboundChain;
      outboundChain = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      try {
        const now = Math.trunc(Number(typeof nowMs === 'function' ? nowMs() : nowMs));
        const intervalMs = NOMINATIM_THROTTLE_INTERVAL_MS;
        const rows = await db`
          update nominatim_throttle
          set next_slot_ms = greatest(next_slot_ms, ${now}::bigint) + ${intervalMs}::bigint
          where id = 1
          returning greatest(next_slot_ms - ${intervalMs}::bigint, ${now}::bigint) as execute_at_ms
        `;
        const executeAt = Number(rows?.[0]?.execute_at_ms);
        if (!Number.isFinite(executeAt)) {
          throw new PlaceSearchError('Nominatim throttle slot update returned no row', 'nominatim_throttle_timeout');
        }
        const throttleWaitMs = Math.max(0, executeAt - now);
        if (throttleWaitMs > maxWaitMs) {
          throw new PlaceSearchError(
            `Nominatim throttle wait ${throttleWaitMs}ms exceeds budget ${maxWaitMs}ms`,
            'nominatim_throttle_timeout',
          );
        }
        if (throttleWaitMs > 0) await sleep(throttleWaitMs);
        const result = await work();
        return { result, throttleWaitMs };
      } finally {
        release();
      }
    },
  };
}

export function getNominatimStore(env = process.env) {
  if (storeOverride) return storeOverride;
  if (!hasDatabase(env)) {
    throw new PlaceSearchError(
      'Nominatim geocode cache requires DATABASE_URL or NEON_DATABASE_URL',
      'nominatim_store_unavailable',
    );
  }
  if (!postgresStoreClient) postgresStoreClient = createPostgresNominatimStore(env);
  return postgresStoreClient;
}

export function nominatimForwardCacheKey(query, limit = 5) {
  const normalized = normalizeNominatimQuery(query);
  if (!normalized) return '';
  return nominatimGeocodeCacheKey('forward', `${normalized}|limit=${Math.min(Math.max(Number(limit) || 5, 1), 10)}`);
}

export function nominatimLabelGeocodeCacheKey(label) {
  const normalized = normalizeNominatimQuery(label);
  if (!normalized) return '';
  return nominatimGeocodeCacheKey('geocode', normalized);
}

function nominatimNormalizedQueryFromCacheKey(cacheKey) {
  const key = String(cacheKey || '').trim();
  if (key.startsWith('forward:')) return key.slice('forward:'.length).split('|limit=')[0]?.trim() || '';
  if (key.startsWith('geocode:')) return key.slice('geocode:'.length).trim();
  return '';
}

function nominatimSearchCacheKey(normalizedQuery, limit) {
  const normalized = String(normalizedQuery || '').trim();
  const lim = Math.min(Math.max(Number(limit) || 1, 1), 10);
  if (!normalized) return '';
  return nominatimGeocodeCacheKey('search', `${normalized}|limit=${lim}`);
}

export function nominatimMinimumSearchLimitForCacheKey(cacheKey) {
  const key = String(cacheKey || '').trim();
  if (key.startsWith('forward:')) {
    const match = key.match(/limit=(\d+)/);
    return match ? Math.min(Math.max(Number(match[1]) || 5, 1), 10) : 5;
  }
  if (key.startsWith('geocode:')) return 1;
  return null;
}

/** Search alias keys with cached limit >= the request's minimum (try higher limits first). */
export function nominatimSearchAliasLookupKeys(cacheKey) {
  const normalized = nominatimNormalizedQueryFromCacheKey(cacheKey);
  const minLimit = nominatimMinimumSearchLimitForCacheKey(cacheKey);
  if (!normalized || minLimit == null) return [];
  const keys = [];
  for (let limit = 10; limit >= minLimit; limit -= 1) {
    keys.push(nominatimSearchCacheKey(normalized, limit));
  }
  return keys;
}

export function nominatimSearchAliasWriteKeys(cacheKey) {
  const normalized = nominatimNormalizedQueryFromCacheKey(cacheKey);
  const minLimit = nominatimMinimumSearchLimitForCacheKey(cacheKey);
  if (!normalized || minLimit == null) return [];
  return [nominatimSearchCacheKey(normalized, minLimit)];
}

export function nominatimWrapSearchCachePayload(payload, searchLimit) {
  return {
    v: 1,
    searchLimit: Math.min(Math.max(Number(searchLimit) || 1, 1), 10),
    payload,
  };
}

export function nominatimUnwrapSearchCachePayload(raw, minSearchLimit, cacheKey = '') {
  const minLimit = Math.min(Math.max(Number(minSearchLimit) || 1, 1), 10);
  if (raw && typeof raw === 'object' && raw.v === 1 && 'searchLimit' in raw && 'payload' in raw) {
    if (Number(raw.searchLimit) < minLimit) return null;
    return raw.payload;
  }
  if (Array.isArray(raw)) {
    if (minLimit > 1) return null;
    return raw;
  }
  if (raw && typeof raw === 'object' && String(cacheKey).startsWith('reverse:')) {
    return raw;
  }
  return null;
}

export function nominatimForwardPayloadCacheable(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.some((hit) => {
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon ?? hit?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
}

export function nominatimReversePayloadCacheable(payload) {
  return Boolean(payload && typeof payload === 'object' && String(payload.display_name || '').trim());
}

export function nominatimLabelGeocodePayloadCacheable(payload) {
  const hit = Array.isArray(payload) ? payload[0] : null;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon ?? hit?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}
