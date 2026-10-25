# Issue #672 — Hotels tab duplicate rows (cursor-ubuntu vkfill-672)

**Start HEAD:** `f7be729670c183c4f04802040a170a38ba0e5aec` (`migrate/trek-source`)

## Change

NYC Hotels tab rendered each hotel twice when the trip had twin catalog + timeline place rows (`Po` / `kn`). Served bundle now dedupes `kn` by normalized hotel name before `vi(kn,"hotels").map(...Oe...)`, preferring timeline rows (`Ds(G)`) and logo rows, then folding description, price, and logo from the dropped twin via `tsFold`.

- `src/vacation/trek-vk-price-coverage-patches.mjs` — `applyHotelsTabCatalogDedupePatch`
- `src/vacation/trek-style2-bundle.mjs` — invoke patch after shared live-tab patches
- `public/assets/index-BKun7ofk.js` — rebaked (`sha256=fdd16357beb8699e48dc4ba903aab297cd39821070d77509c27d0d8e16675792`)
- `scripts/test_shared_hotels_tab_catalog_dedupe.mjs` — bundle contract
- `scripts/offline-tests.txt` — register new test

## Verification (this worktree)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass (sha256=fdd16357beb8699e48dc4ba903aab297cd39821070d77509c27d0d8e16675792) |
| `node scripts/test_shared_hotels_tab_catalog_dedupe.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (296 offline) |
| `node scripts/check-no-comments.mjs` | **blocked** — `apps/vacation-client/node_modules/typescript` missing in lane env |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (255 report, 0 fail) |

## Uncommitted files (host publication only)

- `public/assets/index-BKun7ofk.js`
- `scripts/offline-tests.txt`
- `scripts/test_shared_hotels_tab_catalog_dedupe.mjs`
- `src/vacation/trek-style2-bundle.mjs`
- `src/vacation/trek-vk-price-coverage-patches.mjs`

## Not claimed

CI green, Gate B PASS, merge, deploy — host pipeline.

## Scope left alone

#659/#660 price-hydrate and budget `Mo` dedupe (not on start HEAD `f7be729`). Baselines, Gate B scripts, workflows, `package.json`.
