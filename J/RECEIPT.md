# VK issue #595 receipt (PR #599)

**Start sha:** `446e19137ebe9c6ee0dab651dca078f2cd35f13f`  
**PR:** https://github.com/grampadsbot-sudo/timesyncher/pull/599

**Base merge:** Host merged `origin/migrate/trek-source` at `e3364ac5b3d44795cd3b2d9c857e9c940a9f6790` into `7ccc8481` (2026-10-21).

## GBrain handoff

`gbrain get bot-admin/lanes/vk-pr-handoff/pr-599` → **page_not_found** (2026-10-21).

## Problem

Gate B reported `daybyday-1280.png` at 0.03% vs baseline (run `20261021-230524`). CCAB narrative merge was writing `longDetails` / `summary` onto timeline-selected non-hotel overrides, so Day-by-Day `rowSummary` subtitles appeared where the baseline had none.

## Fix

Scope `mergeStoredCcabNarrativeIntoOverride` so override list-row narrative (longDetails, price, logo, full sourceRecord) applies to hotels and list-only rows only; timeline non-hotel rows upgrade `place.description` for VK contract without override fields that feed the day timeline.

## Checks (local, base-merge round)

| Command | Exit |
| --- | --- |
| `CHROME_PATH=/usr/bin/chromium-browser npm test` (apps/vacation-client) | 0 |
| `node scripts/test_hotel_ccab_narrative_fill.mjs` | 0 |
| `node scripts/test_capture_fixture_replay_harness.mjs` | 0 (after `git -C ~/tsv-dispatch/pr-src worktree prune`) |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

Offline manifest full run: 5 env failures (chrome path `/usr/bin/google-chrome-stable`, stale capture worktree, PDF secrets) — not PR regressions; CI is authority.

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
