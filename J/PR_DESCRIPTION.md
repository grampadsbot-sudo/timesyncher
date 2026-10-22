Closes #621

## Summary

- Root cause: `NYC_STAGING_CAPTURE_LIST_ROWS` Motto hotel row had no `id`, so `appendNycStagingListTabRows` stored `undefined` and `buildPr336VkSearchPlacesByRowId` wrote snapshot key `"undefined"`.
- Assign Motto list row `id` **676** (free above 601–675), rekey checked-in snapshot row `"undefined"` → `"676"`.
- Harden `appendNycStagingListTabRows` (missing ids get `nextFreeId`) and `buildPr336VkSearchPlacesByRowId` via `pr336SnapshotRowIdKey`.
- Add `scripts/test_pr336_vk_search_places_snapshot_keys.mjs` (positive-integer snapshot keys only).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_pr336_vk_search_places_snapshot_keys.mjs` | 0 |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

## Left alone (scope)

Gate B baselines, capture scripts, workflows, allowlists unchanged. No hotel-name-specific assertions.
