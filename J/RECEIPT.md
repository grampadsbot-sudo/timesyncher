# TSV PR #614 / issue #613 (cursor-ubuntu vkfill-614)

**Start sha:** `934915c863c4760423f53a4422953ed0aad8273b`  
**Base merge:** Host merged `origin/migrate/trek-source` at `6800a3b34e9a9773734f52e1526326b3961d463b` into PR head `934915c` (2026-10-22 cursor-ubuntu vkfill-614 dirty-head round).

## Problem

Dirty `mergeable_state` against `migrate/trek-source` at `6800a3b`; chief dr authorized base-merge resolution only (no new layout).

## Fix (this round)

- Resolved `J/PR_DESCRIPTION.md` / `J/RECEIPT.md` merge conflicts; kept #613 hotel 390px ellipsis work from start commit.
- Took base `public/assets/*.js`, ran `node scripts/rebake_served_trek_bundle.mjs` so PR patch sources (`shared-trip-oe-list-row-patch.mjs`, CSS) apply without hand-merging minified JS.
- Staged base fixture delta from merge: Motto snapshot key `#621`, `test_pr336_vk_search_places_snapshot_keys.mjs` (already on base; registered in offline manifest).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `scripts/offline-tests.txt` (PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser) | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` (`rules.via` `gbrain-cli-get_page` vs `bundled-get_page`; GBrain CLI on host) |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Base-merge commit for host publish. CI + Gate B 32/32 on pushed head are authority for merge (not self-certified).
