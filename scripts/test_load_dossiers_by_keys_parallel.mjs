import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadDossiersByKeys } from '../src/vacation/thing-evidence-dossier-store.mjs';

const delayMs = 15;
const placeCount = 20;
const keyByPlaceId = Object.fromEntries(
  Array.from({ length: placeCount }, (_, i) => [String(7000 + i), `shared:probe:${i}`]),
);

const storeImpl = {
  getDossier: async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return {
      thing: 'probe',
      pages: [{ url: 'https://example.test/p', title: 'p' }],
      attempts: [],
    };
  },
  putDossier: async () => {},
};

const t0 = performance.now();
const loaded = await loadDossiersByKeys(keyByPlaceId, { storeImpl });
const elapsed = performance.now() - t0;
assert.equal(Object.keys(loaded).length, placeCount);
assert.ok(
  elapsed < placeCount * delayMs * 0.75,
  `expected parallel load, got ${elapsed.toFixed(1)}ms for ${placeCount} keys at ${delayMs}ms each`,
);
console.log('load_dossiers_by_keys_parallel ok', { elapsed_ms: Math.round(elapsed), placeCount });
