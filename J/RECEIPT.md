# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, hard round tier 1, reland)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).

**Start sha:** `cad653f5861fd04c10875d81cdb7251c28315123`

## Root cause (round 3 revert)

Head `cad653f5` matched base `e3364ac` on `src/` + `public/assets/index-BKun7ofk.js` (docs-only diff). Pre-merge `record_backend_skip` + `known_gaps.gap_close_check` path (1): **0 changed px** on gap screens ⇒ `other gap not closed (#601): backend-only head cad653f changes no screen` (`~/tsv-dispatch/tsv_dispatch.py` L2076–2090; base gaps `~/tsv-dispatch/gateb-basegaps/e3364ac5b3d44795cd3b2d9c857e9c940a9f6790.json`).

## Fix

Restore round-1 `OE_ROW_SR_LOGO_ALIGN_*` flex row in `src/vacation/shared-trip-oe-list-row-patch.mjs` (same as head `b27e3630`). Local structure probe on `pr604-5e40bf0` vs `base-e3364ac` had no `logo not centred with name` on `events-390.png` / `hotels-390.png`; pixel compare without vision: 0 FAIL screens vs base (many NEEDS_JUDGMENT under 1%).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

UI diff vs `e3364ac` restored; closes #601 known gap on head structure (not self-certified). CI + Gate B on pushed head are authority.

**Tip sha:** `147ebaa385674d38ccd908b2f8b95d27f884c3a4`

---

# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, hard round tier 1)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).

**Start sha:** `95cb58d9d5221b496ee8ec909ba8e4e89090140d`  
**Tip sha:** `29ae978442d9d4407cef4af09be774386305f723`

## Root cause (rounds 1–2)

Pre-merge Gate B compares candidates to PR base `e3364ac` (NYC fixture, not approved reference). Rounds 1–2 changed `sr` logo+name layout; Hermes run `20261021-235450` on head `95cb58d9` failed pixel+vision on 19 list-tab PNGs (`~/tsv-gateb/runs/20261021-235450/comment.md`). Local `restore_check.py` v6 on captures in `~/tsv-dispatch/gateb-cand/base-e3364ac-fixture-ff197cd305e728ac` vs `pr604-95cb58d` reported **zero** `logo not centred with name` structure failures on both — the kickback was layout pixels, not structure.

## Hard round fix

Remove `OE_ROW_SR_LOGO_ALIGN_*` patches from `src/vacation/shared-trip-oe-list-row-patch.mjs`; rebake bundle to match `e3364ac` `sr=` grid (`alignItems:"center"`, direct `dc`).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Product code matches PR base `e3364ac` for list-row layout; restores Gate B pixel parity. CI + Gate B on new head are authority (not self-certified). Trek-source `#601` sub-px name-line frame still needs a non-layout follow-up.

---

# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, round 2)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).

**Start sha:** `5e40bf0c518b4c5e47fb9e1f0e347868345e3463`  
**Tip sha:** `098d609a`

## Gate B pre-merge (head `5e40bf0c`, run `20261021-232628`)

Hermes pixel compare vs PR base `e3364ac` (not NYC reference): **FAIL** on 14 list-tab screens named in kickback (`~/tsv-dispatch/logs/gateb-verdicts.jsonl`, `~/tsv-gateb/runs/20261021-232628/comment.md`). Vision flagged layout/text deltas from the list-row logo axis change; not re-certified here.

Local structure probe on captured regions (`~/tsv-gateb/restore-check.mjs`, `events-390-top.png` / `hotels-390-top.png`): hotel visible rows pass name-line logo centering vs base; Apple Fifth Avenue remains −1.5px high on both base and candidate (asset ink asymmetry).

## Round 2 change

Replace round-1 flex/`minHeight:28` `sr` row with grid `alignItems:"start"`, fixed 28×28 `dc` slot — smaller delta vs base while top-aligning chip with first name line (hotels with price column).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Product fix committed locally on `vkfill/601-20261021155744`; host publishes after DONE. CI green + Gate B on new head close #601 (not self-certified).

---

# VK issue #601 receipt (cursor-ubuntu vkfill-601)

**Start sha:** `e3364ac5b3d44795cd3b2d9c857e9c940a9f6790`  
**Tip sha:** `b27e3630`

## Problem

Gate B structure on `migrate/trek-source` tip `446e1913` failed `logo not centred with name` on Events/Hotels/Stores list tabs (e.g. Apple Fifth Avenue, Bergdorf Goodman, Blue Note): logo ink bbox centre vs first name line centre off by 1 px (0.5 px tolerance). Upstream `Oe()` row used a 28px CSS grid with `alignItems:"center"`, which vertically centres the logo chip against the full title cell (including hotel price column), not the first name line Gate B measures.

## Fix

In `src/vacation/shared-trip-oe-list-row-patch.mjs`, replace the logo+name grid with a flex row: fixed 28×28 logo slot (`dc` at size 28) and a `data-ts-list-row-name` cell with `minHeight:28`, `lineHeight:1`, and flex vertical centring so the first `strong` line shares the same vertical axis as the chip. Rebake `public/assets/index-BKun7ofk.js`. Assert layout in `scripts/test_itinerary_fresh_daybyday_bundle.mjs`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Product fix committed on `vkfill/601-20261021155744`; host publishes after DONE. CI green + Gate B on PR head close #601 (not self-certified).

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
