Closes #546

## Summary

Merge current `migrate/trek-source` into #549 (budget #580, flight list-row summary #586, map-marker bounds #581, list-row name `<strong>` wrap #589), keep round 1 Gate B fixes (no generic `Documented NYC option` copy; logos after ccab replay), and fix CI on list-only fixture row **608** (no invented nightly price on `thingOverrides`).

## Changes (round 2 on `da8e61d9`)

- Completed host-started merge of `446e1913` (base `migrate/trek-source`); rebaked `public/assets/index-BKun7ofk.js`.
- **`nyc-craig-kim-daybyday-trip.mjs`**: strip blocked list-only hotel row 608 `price` after `finalizeServedSharedTripPayload` so `scripts/test_vk_search_place_output_contract.mjs` matches base contract (timeline hotel prices unchanged).

## Verification

```bash
node scripts/test_vk_search_place_output_contract.mjs
cd apps/vacation-client && npm test
# full scripts/offline-tests.txt order (CI parity)
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B checker config, workflows, contract tests, NYC snapshot JSON.
