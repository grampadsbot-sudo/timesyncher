# PR #694 / issue #672 — Hotels dedupe + Gate B price/description (cursor-ubuntu)

**Start HEAD:** `6f14d98c104bf223640d4cf156e25f972b1b44bc`

## Root cause (Gate B auto round 1 on 6f14d98c)

Hotels tab dedupe kept timeline twins but `ha(G)` returned sparse `thingOverrides` only (`tsFillOv` with no `tsPf` spec returned `base||{}`), so `bi(G)`, `rr(G)`, and list summaries ignored catalog `place` fields (price, summary, longDetails). Flights and budget rows use the same `ha()` / `bi()` chain.

## Change

1. **`tsFillOv`** — when no product-field spec matches, merge non-empty `thing` place fields into overrides (summary, longDetails, itinerary note, price, logo) before `ha()` reads them.
2. **`rr()` list rows** — fall back to `G.summary` / `G.description` / `G.longDetails` after override picks.
3. **Hotels `kn` dedupe** — stronger twin fold (longDetails, price from `G.price` / `bi(g)`), better scoring on place text.

## Files

- `src/vacation/trek-style2-bundle.mjs` — `tsFillOv` / `fillThing`
- `src/vacation/trek-thing-detail-fields-patch.mjs` — `rr()` place fallback
- `src/vacation/trek-vk-price-coverage-patches.mjs` — `tsFold` / `tsScore`
- `public/assets/index-BKun7ofk.js` — rebaked (`sha256=6a3235d4db05c1439deb66432a7e789a0104cfb39b4fb0fb06b0cefa9396a742`)
- `scripts/test_shared_hotels_tab_catalog_dedupe.mjs` — contract asserts

## Verification (worktree)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass (sha above) |
| `node scripts/test_shared_hotels_tab_catalog_dedupe.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (296 offline) |
| `node scripts/test_keepsake_style2.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-no-comments.mjs` | **blocked** — missing `apps/vacation-client/node_modules/typescript` (host `npm ci` in vacation-client) |

## Uncommitted (host publication only)

- `public/assets/index-BKun7ofk.js`
- `scripts/test_shared_hotels_tab_catalog_dedupe.mjs`
- `src/vacation/trek-style2-bundle.mjs`
- `src/vacation/trek-thing-detail-fields-patch.mjs`
- `src/vacation/trek-vk-price-coverage-patches.mjs`
- `J/RECEIPT.md`

## Not claimed

CI green, Gate B 32/32 structure+data on new head, merge — host pipeline after push.
