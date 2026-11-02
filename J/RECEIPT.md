# vkfill-549 round 6 (verify + incomplete-row 608 price contract)

**Start sha:** `d75f900d7cf8a94cc08267ad114386f0de97fa9e`

## Changes

- **`capture-pre-data-check.mjs`**: skip `blank_price` for `GATE_B_INCOMPLETE_LIST_ROW_IDS` (608 list-only hotel).
- **`test_nyc_offline_shared_trip_608.mjs`**: same exemption on hotel price assert; 22/22 hotel descriptions + sources unchanged.

Prior #549 vk-merge substance (`stored-ccab-narrative-merge`, `hotel-list-row-narrative`, list tab 608 fallback, ccab identity tests) retained at `9db47bc6` / `2bcb83e1`.

## Checks (local)

All commands in `vkfill-549-RECEIPT.md` PASS on patched tree.

## Left alone

Fixture JSON, Gate B config, baselines, deploy.

**Host tip after publish:** `<host commit sha>`
