# vkfill-549 round (2026-11-02, cursor-ubuntu)

## Round 2026-11-02 ~19:22 UTC (hotel Oe summary guard + live-app narrative re-bind)

**Start sha:** `8fd669a237fadbcb148b42f55c9d1fe8ac0517df` (PR #549 head per lane brief 11:18 AM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY (uncommitted patch). Fixes CI `scripts/test_shared_tab_list_summary.mjs:89` (summary row missing when `Pn` empty) and binds hotel list display to `tsListRowDescription` / long `place.description` instead of short `ha(G).summary` alone.

### Root cause

`shared-trip-oe-list-row-patch.mjs` wrapped list summary in `Pn?(()=>…)` so hotels with empty composed `Pn` rendered no `[data-list-summary]`. The same patch preferred `ha(G).summary` (assignment blurb) over substantive `Pn`. CCAB merge could drop `longDetails` before the client hydrated overrides.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Summary block runs for hotels when `Pn` is empty; show `Pn` (≥30 words clamped) then long override/place narrative, then summary fallback |
| `src/vacation/shared-trip-live-app-fields.mjs` | After CCAB merge, re-bind hotel `longDetails`/`description`/`summary`/`place.description` from `pickLongDetails` when generic or planning-note |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `7c2ac81fae17f348a3674189ccb735ba865a5b0163b5467e236f015945b8a62c`) |

### Checks (local, start `8fd669a2` + patch)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B hotels-390/1280 description bar not re-run in lane (no Cursor self-proof); host structure replay required after push.

---

## Round 2026-11-02 ~19:06 UTC (hotel list-row binding + bundle rebake)

**Start sha:** `bea634951f5d7469ddf4b7d5a4ad780a868c7268` (PR #549 head per `bot-admin/lanes/vk-pr-handoff/pr-549` 11:02 AM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY (uncommitted patch). Fixes CI `scripts/test_served_trek_bundle.mjs:69` and binds hotel list rows to substantive `places[].description` instead of generic assignment blurbs.

### Root cause

Generic `thingOverrides` / assignment `description` and itinerary `summary` won over long `place.description` in `pickLongDetails`, `storedListNarrativeFallback`, and TREK `tsListRowDescription` spare text. Committed bundle was stale after prior `list-row-description.mjs` edits.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/list-row-description.mjs` | `pickSubstantiveListNarrative`; hotel rows omit short hook when ≥30-word narrative exists; spare prefers `place.description`; bundle snippet aligned; `minWords` in finalize |
| `apps/vacation-client/src/lib/listTabModel.mjs` | Same narrative pick + hotel hook suppression; 30-word finalize for hotels |
| `src/vacation/shared-trip-live-app-fields.mjs` | Skip generic override text in `pickLongDetails`; replace generic hotel `description`; copy place narrative into overrides |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `c39b01c1ecb080a5a5a6717d761e374e48e29bb25f749686401cd0e21627110a`) |

### Checks (local, start `bea63495` + patch)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B hotels-390/1280 description bar not re-run in lane (no Cursor self-proof); host structure replay required after push.

---

**Start sha:** `b1fda040f752527cbcf1323922d3af22aedab86b` (PR #549 head; ref `bot-admin/lanes/vk-pr-handoff/pr-549` 10:58 AM PT)

## Outcome

CI was already green on start head (Actions 10:27 AM PT per handoff). This lane applied a **vk-aligned logo replay merge** on PR #546 description work without a git merge of `origin/vk` (base-merge still dirty in J/ only vs vk `6e88120`).

## Root cause (Gate B items 2 and 4 vs vk)

PR #549 dropped vk’s `applyListRowLogoFields` / `applyServedListLogoOverridesOnly` from `shared-trip-live-app-fields.mjs` and simplified fixture replay to `applyLiveAppListRowFields` only. Gate B capture reads override logos via replay; placeholder/shared fallbacks and missing Dollar-style favicons match that regression. vk logo intent lives on `origin/vk` (`ebaaa74` family); merged manually into this branch’s files.

## Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-live-app-fields.mjs` | Restore vk list-row logo enrichment (`isPlaceholderLogoUrl`, override-only replay export); keep PR car/hotel/ccab/608 price semantics |
| `src/vacation/shared-trip-fixture-replay.mjs` | After ccab + `applyLiveAppListRowFields`, chain `applyServedListLogoOverridesOnly` for Gate B served payload |
| `apps/vacation-client/src/lib/listTabModel.mjs` | `logoUrlForPlace`: vk order (`resolveThingLogoDisplayUrl`, skip placeholders) with stored-ccab merge |
| `src/vacation/list-row-description.mjs` | Experience rows: `Set time` line + matching TREK bundle snippet (Blue Note–class weak rows) |

## Checks (local, start head + patch)

| Command | Result |
| --- | --- |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | PASS |

**Cars list (item 3):** `placesForCategoryTab` on finalized Gate B fixture → **7** car rows locally; empty `cars-390-top` not reproduced in model — treat as capture race until host Gate B re-run.

**Descriptions (item 1):** Not re-scored to 12/15 in lane (no Cursor self-proof). Small composer/snippet lift only; host Gate B judgment required.

**Merge conflicts vs vk:** Product paths reconciled toward vk logo + PR #546 substance; full git merge still blocked on `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `scripts/offline-tests.txt` — host resolves J/ on publish, not edited here beyond this receipt.

## Left alone

Baselines, Gate B thresholds, workflows, fixtures, `offline-tests.txt`, deploy config. No git commit in lane (HOST PUBLICATION ONLY).

**Host:** stage the four product files above + this receipt; commit on `cursor/tsv-546-known-gap-on-migrate-trek-source-description-substance-and-quality-4c4d`, push once, re-run Gate B structure on pushed head.
