# vkfill-549 round (2026-11-02, cursor-ubuntu)

## Round 2026-11-02 ~20:08 UTC (CI budget harness — trim live-app imports)

**Start sha:** `d39f865a865f84f5ada6b296d0a244310562e4da` (PR #549 head per lane brief 12:08 PM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY. Fixes CI `scripts/test_budget_checkout_harness.mjs` / `gateb_head_budget_lines exit 1` on Actions run 41505578516 class failure at repo head.

### Root cause

`shared-trip-live-app-fields.mjs` imported `isGenericDescription` from `trip-thing-enrichment.mjs` and `isHotelPlanningNote` from `hotel-list-row-narrative.mjs`. That pulled `trip-thing-enrichment` → dossier/search → `poi-search` → `provider-env.mjs`, which reads `scripts/deploy-required-env.json` at module load. `budget_archive_paths` for head `d39f865a` does not include that JSON (only `scripts/fixtures`, `src`, etc.), so archived `gateb_head_budget_lines` crashed with ENOENT.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-live-app-fields.mjs` | Import `isGenericDescription` and `isHotelPlanningNote` from `list-row-generic-description.mjs` only; keeps budget driver import graph on `src` + fixtures without reply-rules/provider-env |

Hotel list-row substance remains on prior head (`listTabModel.mjs`, CCAB merge, trek patch). No rebake delta after fix (bundle already matched `renderServedTrekBundle`).

### Checks (local, start `d39f865a` + patch)

| Command | Result |
| --- | --- |
| Patched archive sim (`budget_checkout` + copied `shared-trip-live-app-fields.mjs`) → `fill_budget` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_vk_hotel_gate_b_description_acceptance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/test_budget_checkout_harness.mjs` | FAIL until host commits patch (archives committed HEAD without import fix) |
| `node scripts/run-offline-tests.mjs` | Stops at budget harness (same) |

**Host:** commit `shared-trip-live-app-fields.mjs`; re-run `node scripts/test_budget_checkout_harness.mjs` then push once.

---

## Round 2026-11-02 BASE-MERGE (origin/vk `6e881200` into `27fc0e18`)

**Start sha:** `27fc0e18204adaf6be71abacf69816de57b3e50b` (PR #549 head per chief brief 12:53 PM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY. Resolved host merge of `origin/vk` `6e881200` into `27fc0e18`; rebaked bundle; client-safe ccab merge (no dossier import in vacation-client build).

### Checks

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256 `40cfc83548bc49fdf2a30d06c2b52cf47d95c9e631d3c36c04aa1587a162acc0`) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_vk_hotel_gate_b_description_acceptance.mjs` | PASS |
| `node scripts/test_vk_hotel_detail_fill.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |

Gate B hotels description bar not re-run in lane (no Cursor self-proof).

**Host:** stage resolved files + rebaked bundle; `git commit --no-edit` for merge, then push once.

---

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

## Left alone

Baselines, Gate B thresholds, workflows, fixtures, deploy config. No git commit in lane (HOST PUBLICATION ONLY).
