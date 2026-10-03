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
      const now = Number(typeof nowMs === 'function' ? nowMs() : nowMs);
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
      const callAtMs = typeof nowMs === 'function' ? nowMs() : Date.now();
      return work(Number.isFinite(Number(callAtMs)) ? Number(callAtMs) : Date.now());
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
  return createPostgresNominatimStore(env);
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
