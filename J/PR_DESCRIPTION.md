Closes #980

## Summary

PR **#985** on `vkfill/980-20261113111627`: hotel/car list and budget totals use ruling #76 estimated totals (`thingTravelTotalPrice`). This round resolves host **base merge** of `origin/vk` at `995df4ee` into head `df3a7598` (dirty against `vk`).

## Base merge conflict resolution

- `scripts/offline-tests.txt`: union — keep `test_thing_travel_total_price.mjs` (#980) and vk `test_acceptance_988_*` / `test_acceptance_989_*` offline entries.
- `J/RECEIPT.md`: PR receipt + merge note.
- `public/assets/index-BKun7ofk.js`: vk version from merge, then `node scripts/rebake_served_trek_bundle.mjs`.

## Prior product fix (branch)

- Budget/API fixtures: `scripts/test_shared_trip_api_budget_lines.mjs` aligned to **$480** hotel estimate and **$580** trip planned per `bot-admin/decisions/vk-hotels-cars-list-total-price-20261113`.

## Verification (local, start HEAD `df3a7598`, merge tree)

```bash
npm ci
node scripts/rebake_served_trek_bundle.mjs
cd apps/vacation-client && npm test
node scripts/test_shared_trip_api_budget_lines.mjs
node scripts/test_thing_travel_total_price.mjs
node scripts/test_728_budget_data.mjs
node scripts/test_offline_manifest.mjs
node scripts/check-no-comments.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All above exit 0 except `test_acceptance_988_no_summary_details_fallback.mjs` (stale NYC payload hash pin on merged `vk` at `995df4ee`; documented in `J/RECEIPT.md`).

## Left alone (scope)

Baselines, Gate B capture config, workflows, `vercel.json`, fixture NYC data, unrelated vk product files beyond merge. Full serial `scripts/offline-tests.txt` suite deferred to host/CI.