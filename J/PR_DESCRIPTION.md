Closes #613

## Problem

Live accept at 390px reported hotel list titles ~68px past the right edge on `/shared/` (served `Oe()` bundle). Round 0 added mobile **wrap** CSS; Gate B failed `hotels-390` / `hotels-390-top` pixel compare and conflicts with #547 (name and description stay one ellipsis-truncated line at every width).

## Fix

1. Keep `data-ts-hotel-row-head` and `minmax(0,1fr) auto` hotel title+price grid in `shared-trip-oe-list-row-patch.mjs`; add block ellipsis on the title `<strong>`.
2. Replace `@media (max-width:480px)` Hotels rules in `public/assets/index-CbEHlMj6.css` with **truncation** (`nowrap` + `text-overflow:ellipsis`, grid `min-width:0`) — no `white-space:normal` / `overflow-wrap`.
3. `[data-ts-list-row-name]` gets `width:100%` / `maxWidth:100%` via `trek-live-product-patches.mjs`.
4. Offline contract `scripts/test_shared_hotels_390_text_wrap.mjs` updated for truncation (registered in `scripts/offline-tests.txt`).

**Base merge:** Host merged `origin/migrate/trek-source` at `6800a3b34e9a9773734f52e1526326b3961d463b` into PR head `934915c863c4760423f53a4422953ed0aad8273b` (2026-10-22 cursor-ubuntu vkfill-614); served `public/assets/*.js` taken from base then `node scripts/rebake_served_trek_bundle.mjs` with PR patch sources restored.

## Checks run (local)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| Pre-DONE: `check-no-comments`, `test_offline_manifest`, `check-code-ratchet` (`migrate/trek-source`, `codex/ruling95-consolidated-logo`) | 0 |

**Not run locally:** Gate B pixel compare, live `live_accept.py`. Full `offline-tests.txt` loop may stop at `test_live_transcript_dialog_pdf.mjs` on hosts with GBrain CLI installed.

**Authority:** CI green on published PR head + Gate B PASS on all 32 screens.

## Left alone

- `apps/vacation-client` mobile wrap rules (#596 path).
- Fixture price/description gaps named in chief-dr brief (data/harness; not patched in this layout round).
- Base `#621` snapshot-key hardening merged via `migrate/trek-source` (Motto row id 676); no change to #614 hotel ellipsis look.
