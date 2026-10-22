# TSV PR #614 / issue #613 (cursor-ubuntu vkfill-614)

**Start sha:** `8481be47a74f2e17d0e265123c97847eeffe90e5`  
**Tip sha:** `8f7abb9e`  
**Base merge:** Host merged `origin/migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into PR head `8481be47` (2026-10-22 cursor-ubuntu vkfill-614).

## Problem

Gate B pixel FAIL on `hotels-390.png` and `hotels-390-top.png` at head `3e0095ec`: round-0 fix used `@media (max-width:480px)` wrap (`white-space:normal`, `overflow-wrap:anywhere`), which conflicts with Craig #547 (name + description stay one ellipsis line at 390). Dirty mergeable_state required base merge per chief dr.

## Fix

- Replace Hotels mobile CSS with single-line `text-overflow:ellipsis` / `nowrap` constraints on row grid, `[data-ts-list-row-name]`, `[data-ts-hotel-row-head]`, and summary line (no title wrap).
- `je()` hotel head: block-level ellipsis on `<strong>`; list-row name span `width:100%` / `maxWidth:100%` in `trek-live-product-patches.mjs` (PR patch sources kept over auto-merge regression).
- Merge `migrate/trek-source` enrichment/fixture changes; take base `public/assets/*.js`, rebake; restore `scripts/test_shared_hotels_390_text_wrap.mjs` in `scripts/offline-tests.txt`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page`); **fail** `scripts/test_gate_b_product_row_fields.mjs:320` row 602 summary (reproduces on bare `e2cbfcfe` MERGE_HEAD) |

## Verdict

Merge commit ready for host publish; CI + Gate B 32/32 on pushed head are authority for merge. Chief-dr price/description lines on fixture data not changed this round (no UI/data patch in scope).

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
