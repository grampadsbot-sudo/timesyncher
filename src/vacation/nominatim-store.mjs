import { hasDatabase, sql } from './db.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

export const NOMINATIM_GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOMINATIM_THROTTLE_INTERVAL_MS = 1000;
const NOMINATIM_THROTTLE_MAX_WAIT_MS = 45_000;

let storeOverride = null;

export function useNominatimStore(store) {
  storeOverride = store || null;
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

function createMemoryNominatimStore() {
  const cache = new Map();
  let nextSlotMs = 0;
  let slotChain = Promise.resolve();

  return {
    async getCachedGeocode(cacheKey) {
      const key = String(cacheKey || '').trim();
      if (!key) return null;
      const hit = cache.get(key);
      if (!hit || hit.expiresAt <= Date.now()) {
        if (hit) cache.delete(key);
        return null;
      }
      return hit.payload;
    },
    async putCachedGeocode(cacheKey, payload, ttlMs = NOMINATIM_GEOCODE_CACHE_TTL_MS) {
      const key = String(cacheKey || '').trim();
      if (!key || payload === undefined) return;
      cache.set(key, { payload, expiresAt: Date.now() + Math.max(Number(ttlMs) || 0, 1) });
    },
    async reserveNominatimSlot({
      nowMs = Date.now(),
      maxWaitMs = NOMINATIM_THROTTLE_MAX_WAIT_MS,
      sleep = defaultSleep,
    } = {}) {
      let release;
      const prior = slotChain;
      slotChain = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      try {
        const now = Number(nowMs);
        const executeAt = Math.max(nextSlotMs, now);
        nextSlotMs = executeAt + NOMINATIM_THROTTLE_INTERVAL_MS;
        const waitMs = Math.max(0, executeAt - now);
        if (waitMs > maxWaitMs) {
          throw new PlaceSearchError(
            `Nominatim throttle wait ${waitMs}ms exceeds budget ${maxWaitMs}ms`,
            'nominatim_throttle_timeout',
          );
        }
        if (waitMs > 0) await sleep(waitMs);
      } finally {
        release();
      }
    },
  };
}

function createPostgresNominatimStore(env) {
  const db = sql(env);
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
      const payload = rows?.[0]?.payload;
      return payload === undefined || payload === null ? null : payload;
    },
    async putCachedGeocode(cacheKey, payload, ttlMs = NOMINATIM_GEOCODE_CACHE_TTL_MS) {
      const key = String(cacheKey || '').trim();
      if (!key || payload === undefined) return;
      const ttl = Math.max(Number(ttlMs) || 0, 1);
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      await db`
        insert into nominatim_geocode_cache (cache_key, payload, expires_at)
        values (${key}, ${payload}, ${expiresAt}::timestamptz)
        on conflict (cache_key) do update
        set payload = excluded.payload,
            expires_at = excluded.expires_at
      `;
    },
    async reserveNominatimSlot({
      nowMs = Date.now(),
      maxWaitMs = NOMINATIM_THROTTLE_MAX_WAIT_MS,
      sleep = defaultSleep,
    } = {}) {
      const now = Number(nowMs);
      const rows = await db`
        update nominatim_throttle
        set next_slot_ms = greatest(next_slot_ms, ${now}) + ${NOMINATIM_THROTTLE_INTERVAL_MS}
        where id = 1
        returning greatest(next_slot_ms - ${NOMINATIM_THROTTLE_INTERVAL_MS}, ${now}) as execute_at_ms
      `;
      const executeAt = Number(rows?.[0]?.execute_at_ms);
      if (!Number.isFinite(executeAt)) {
        throw new PlaceSearchError('Nominatim throttle slot update returned no row', 'nominatim_throttle_timeout');
      }
      const waitMs = Math.max(0, executeAt - now);
      if (waitMs > maxWaitMs) {
        throw new PlaceSearchError(
          `Nominatim throttle wait ${waitMs}ms exceeds budget ${maxWaitMs}ms`,
          'nominatim_throttle_timeout',
        );
      }
      if (waitMs > 0) await sleep(waitMs);
    },
  };
}

export function getNominatimStore(env = process.env) {
  if (storeOverride) return storeOverride;
  if (hasDatabase(env)) return createPostgresNominatimStore(env);
  return createMemoryNominatimStore();
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

export function nominatimLabelGeocodePayloadCacheable(payload, label) {
  const hit = Array.isArray(payload) ? payload[0] : null;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon ?? hit?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && String(label || '').trim();
}
