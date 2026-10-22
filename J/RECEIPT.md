# TSV PR #614 / issue #613 (cursor-ubuntu vkfill-614)

**Start sha:** `8481be47a74f2e17d0e265123c97847eeffe90e5`  
**Tip sha:** `c504de62`  
**Base merge:** Host merged `origin/migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into PR head `8481be47` (2026-10-22 cursor-ubuntu vkfill-614).

## Problem

Gate B pixel FAIL on `hotels-390.png` / `hotels-390-top.png` at head `3e0095ec` (wrap CSS vs #547 single-line ellipsis). Dirty `mergeable_state` required base merge per chief dr.

## Fix (this round)

- Merge already on branch at `23a74a5c`; restored PR `#614` gate-b hotel bundle assert (`data-ts-hotel-row-head` + styled `<strong>`) lost in merge conflict resolution.
- After base merge, ccab enrichment overwrote pr336 snapshot summaries for VK copy rows `601–611`; re-apply `applyVkSearchSnapshotCopyFields` on the ccab path so `test_gate_b_product_row_fields.mjs` pr336 binding holds.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `scripts/offline-tests.txt` (with `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`) | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` (`rules.via` `gbrain-cli-get_page` vs `bundled-get_page` on this host; gbrain CLI present) |

## Verdict

Base-merge follow-up committed for host publish. CI + Gate B 32/32 on pushed head are authority for merge. `test_live_transcript_dialog_pdf.mjs` failure is host env (GBrain CLI route), not PR #614 layout.
