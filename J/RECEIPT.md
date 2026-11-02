# vkfill-550 receipt (#547 thing-header inline desc + #471 name frame)

## Outcome

**source-ready** on git HEAD **3e38db7ce36d23bc3ed4be80b36c8cbb27bb9872** (dr handoff: CI `test_ui_471_apple_row_name_frame.mjs` vs nested description inside `data-ts-list-row-name`).

## Fix

**`src/vacation/shared-trip-oe-list-row-patch.mjs`**: `patchInlineListRowDescriptionOnThingHeader` — keep `#471` `data-ts-logo-name-pair` + inner `data-ts-list-row-name` (Zn only, nowrap/ellipsis) byte-identical; wrap logo-name-pair and `data-list-summary` in an outer inline-flex sibling row so description stays on the name line (#547).

**`scripts/test_shared_tab_list_summary.mjs`**: assert the wrapper contract (same #547 rule; description no longer nested inside `data-ts-list-row-name`).

**`public/assets/index-BKun7ofk.js`**: rebaked (`sha256=c1f8248e42ce90e29d76bd9c12bb4521b4fea713b059f930caf91c0f0b839022`, 6590685 bytes).

## Uncommitted (host publish)

| Path | Change |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | thing-header inline desc as sibling after logo-name-pair |
| `scripts/test_shared_tab_list_summary.mjs` | contract regex for wrapper layout |
| `public/assets/index-BKun7ofk.js` | rebaked |
| `J/RECEIPT.md` | this receipt |

## Checks (local, uncommitted tree)

| Command | Exit | Ref |
| --- | --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 | sha256 above |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | 0 | HEAD **3e38db7c** |
| `node scripts/test_shared_tab_list_summary.mjs` | 0 | |
| `node scripts/test_served_trek_bundle.mjs` | 0 | |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | 0 | |
| `node scripts/test_gate_b_row_name_frame.mjs` | 0 | |
| `node scripts/check-no-comments.mjs` | 0 | |
| `node scripts/test_offline_manifest.mjs` | 0 | |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 | 0 fail |
| `cd apps/vacation-client && npm test` | 0 | HEAD **3e38db7c** |
| `node scripts/run-offline-tests.mjs` | 1 | `test_live_transcript_dialog_pdf.mjs:651` env: `gbrain-cli-get_page` vs `bundled-get_page` (pre-existing lane env; not #547) |

Authority: CI on pushed head + host Gate B structure (not Cursor self-proof).

## Left alone

Base merge (worktree still at **3e38db7c**, clean merge not in progress). Baselines, Gate B config, workflows, dependencies, evidence PNGs (restored after accidental vacation-client test writes).
