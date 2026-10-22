# TSV PR #614 / issue #613 (cursor-ubuntu vkfill-614)

**Start sha:** `3e0095ecc2f5e9824b1eaa03ef955df7b995d507`  
**Tip sha:** (written at commit)

## Problem

Gate B pixel FAIL on `hotels-390.png` and `hotels-390-top.png` at head `3e0095ec`: round-0 fix used `@media (max-width:480px)` wrap (`white-space:normal`, `overflow-wrap:anywhere`), which conflicts with Craig #547 (name + description stay one ellipsis line at 390).

## Fix

- Replace Hotels mobile CSS with single-line `text-overflow:ellipsis` / `nowrap` constraints on row grid, `[data-ts-list-row-name]`, `[data-ts-hotel-row-head]`, and summary line (no title wrap).
- `je()` hotel head: block-level ellipsis on `<strong>`; list-row name span `width:100%` / `maxWidth:100%` in `trek-live-product-patches.mjs`.
- Rebake `public/assets/index-BKun7ofk.js`; update `scripts/test_shared_hotels_390_text_wrap.mjs` to forbid wrap and assert truncation.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Layout fix ready on detached tip for host publish; CI + Gate B 32/32 on new head are authority for merge. Chief-dr price/description lines on fixture data not changed this round (no UI/data patch in scope).

---

# VK issue #589 receipt (cursor-ubuntu vkfill-589)

**Start sha:** `7bc66068db57e6afa646eec0ddbcf911b4f5f9ed`  
**Tip sha:** `0fd6dc78`

## Problem

Gate B structure on `migrate/trek-source` failed `logo not centred with name` for Events list rows (Apple Fifth Avenue, Bergdorf Goodman, Blue Note, …): `missing visible name line (fail closed)`. Capture records `first_text` only from a `span`/`strong` leaf inside `[data-ts-list-row-name]`; default `Oe()` rows used plain `ua` text in that span (no leaf), so `first_text` was null while the logo chip was measured.

## Fix

Wrap the default non-flight/car/hotel title in `<strong>` when building `Zn` in `src/vacation/shared-trip-oe-list-row-patch.mjs`; rebake `public/assets/index-BKun7ofk.js`. Assert in `scripts/test_itinerary_fresh_daybyday_bundle.mjs`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Product fix ready on branch `vkfill/589-20261021131734`; host publishes once; CI + Gate B on PR head are authority for close.

---

# TSV PR #598 Gate B fix-it (TSV #596)

**Start sha:** `375fdc067c9beca9fc65559d6a824a60d496866f`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-598` (initial automated fetch returned `page_not_found`; page exists via `gbrain get_page` with compiled handoff at 4:10 PM PT)

**Base merge:** Host merged `origin/migrate/trek-source` at `e3364ac5` into PR head `7d358bd7` (2026-10-21 cursor-ubuntu vkfill-598). **Merge tip:** `f2308dff`.

## Problem

- Gate B pixel compare flagged `daybyday-1280.png` (~0.034%): OSM map tile flake vs frozen `base-446e191` (handoff: harness/map, not list CSS).
- Remaining product gap: **Events (The Rest) at 390px** — long `Flight option:` rows (`tsv-row-flight-main`) kept `nowrap` names and extended past the viewport.

## Fix

- Consolidate mobile wrap into one `@media (max-width: 480px)` block; budget names use `.tsv-budget-line .tsv-budget-line-name` so base `nowrap` does not win.
- Add `[data-shared-live-tab='events'] .tsv-row-flight-main .tsv-row-name` mobile wrap (Flights tab keeps single-line flight names for ink/layout tests).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_vacation_client_list_row_390_text_wrap.mjs` | 0 |
| `node apps/vacation-client/test/list-layout.mjs` | 0 |
| Gate NYC fixture events @390 row box probe (no elements with `right > viewport`) | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:861` — `pdftotext` not on PATH (`layout.status` null); host CI expected |

## Verdict

Merge commit `f2308dff` on `cursor/tsv-596-vk-390px-descriptions-are-clipped-run-past-the-right-edge-hotels-the-rest-budget-8ccf`; host publishes once. CI + Gate B on pushed head are authority for close (not self-certified).

---

# VK issue #597 / PR #600 CI fix (round 1)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-600` — **page not found** (checked via MCP `get_page`, 2026-10-21).

**CI failure:** `scripts/test_gate_b_product_row_fields.mjs` expected 63 ccab enrichment keys; #597 added `Midtown sample hotel` (+ duplicate Romer ASCII key).

**Fix:** Drop duplicate `Romer Hell's Kitchen` enrichment entry; resolve ccab keys through `resolveNycCcabKey` before lookup; expect **64** documented places in the gate-b product row test.

**Check:** `node scripts/test_gate_b_product_row_fields.mjs` → pass (2026-10-21 local).

---

# VK PR #600 round 2 (cursor-ubuntu vkfill-600)

**Start sha:** `e2ea7d18d0692883a95212fb0ebcab66a7279d30`  
**Tip sha:** `b8a2da1a`

**Problem:** Round 1 resolved ccab lookup in `buildGateBSearchPlaceForRow` but `assertGateBRowProvenance` still compared raw list-tab `ccabKey` (ASCII apostrophe) to materialized `externalId` (curly apostrophe via `resolveNycCcabKey`), so `node scripts/regenerate_pr336_search_trip_fixture.mjs` failed on row 625.

**Fix:** Resolve ccab keys in `assertGateBRowProvenance` the same way as build; skip fuzzy title/ccab mismatch when `resolveNycCcabKey(row.name)` already matches. Regenerated snapshot sets row 625 `externalId` to `Romer Hell's Kitchen` (curly).

**Checks (local, 2026-10-21):**

| Command | Exit |
| --- | --- |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | 0 |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | 0 |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `node scripts/vk_search_place_source_contract_check.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

**Verdict:** Fix committed locally on detached HEAD at start commit; host publishes once. CI green on pushed PR head is authority for close (not self-certified).
