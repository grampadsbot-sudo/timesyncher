import { useNominatimStore } from '../../src/vacation/nominatim-store.mjs';

export const noopNominatimStore = {
  async getCachedGeocode() {
    return null;
  },
  async putCachedGeocode() {},
  async reserveNominatimSlot() {},
};

export function installNoopNominatimStore() {
  useNominatimStore(noopNominatimStore);
}

export function resetNominatimStore() {
  useNominatimStore(null);
}
