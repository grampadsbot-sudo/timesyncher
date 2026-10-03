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
    return work(Date.now());
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
        const waitMs = Math.max(0, executeAt - now);
        if (waitMs > maxWaitMs) {
          throw new PlaceSearchError(
            `Nominatim throttle wait ${waitMs}ms exceeds budget ${maxWaitMs}ms`,
            'nominatim_throttle_timeout',
          );
        }
        if (waitMs > 0) await sleep(waitMs);
        const callAtMs = typeof nowMs === 'function' ? nowMs() : Date.now();
        return await work(Number.isFinite(Number(callAtMs)) ? Number(callAtMs) : Date.now());
      } finally {
        release();
      }
    },
  };
}
