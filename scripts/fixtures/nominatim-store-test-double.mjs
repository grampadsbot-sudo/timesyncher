import {
  NOMINATIM_GEOCODE_CACHE_TTL_MS,
  useNominatimStore,
} from '../../src/vacation/nominatim-store.mjs';
import { PlaceSearchError } from '../../src/vacation/place-search-error.mjs';

export const noopNominatimStore = {
  async getCachedGeocode() {
    return null;
  },
  async putCachedGeocode() {},
  async reserveNominatimSlot() {},
  async runNominatimThrottled(work) {
    const result = await work();
    return { result, throttleWaitMs: 0 };
  },
};

export function installNoopNominatimStore() {
  useNominatimStore(noopNominatimStore);
}

export function resetNominatimStore() {
  useNominatimStore(null);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const NOMINATIM_THROTTLE_INTERVAL_MS = 1000;
const NOMINATIM_THROTTLE_MAX_WAIT_MS = 45_000;

/** In-memory Nominatim store for unit tests only (not used in production). */
/** Shared Neon-style sql executor: throttle UPDATE ... RETURNING + geocode cache upsert/select. */
export function createFaithfulNeonNominatimDb() {
  const cache = new Map();
  let nextSlotMs = 0;
  let throttleChain = Promise.resolve();
  const db = async (strings, ...values) => {
    const text = strings.join(' ').toLowerCase();
    if (text.includes('insert into nominatim_geocode_cache')) {
      const [cacheKey, payloadJson] = values;
      const expiresAt = values[2];
      cache.set(String(cacheKey), { payloadJson, expiresAt });
      return [];
    }
    if (text.includes('from nominatim_geocode_cache')) {
      const [cacheKey] = values;
      const row = cache.get(String(cacheKey));
      if (!row) return [];
      const payload = typeof row.payloadJson === 'string' ? JSON.parse(row.payloadJson) : row.payloadJson;
      return [{ payload }];
    }
    if (text.includes('update nominatim_throttle')) {
      let release;
      const prior = throttleChain;
      throttleChain = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      try {
        const now = Number(values[0]);
        const interval = Number(values[1]);
        const executeAt = Math.max(nextSlotMs, now);
        nextSlotMs = executeAt + interval;
        return [{ execute_at_ms: executeAt }];
      } finally {
        release();
      }
    }
    throw new Error(`unexpected sql: ${strings.join('')}`);
  };
  return { db, cache, getNextSlotMs: () => nextSlotMs };
}

export function createMemoryNominatimStore() {
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
    async reserveNominatimSlot(options = {}) {
      await this.runNominatimThrottled(async () => {}, options);
    },
    async runNominatimThrottled(work, {
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
        const now = Number(typeof nowMs === 'function' ? nowMs() : nowMs);
        const executeAt = Math.max(nextSlotMs, now);
        nextSlotMs = executeAt + NOMINATIM_THROTTLE_INTERVAL_MS;
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
