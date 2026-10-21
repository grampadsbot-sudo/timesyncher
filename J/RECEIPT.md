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
