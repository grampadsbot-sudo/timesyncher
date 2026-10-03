import { useNominatimStore } from '../../src/vacation/nominatim-store.mjs';

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
