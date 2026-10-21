# VK #587 / PR #591 receipt

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-591`: page not found (fetch failed at lane start).

Base merge: host merged `origin/migrate/trek-source` at `446e19137ebe9c6ee0dab651dca078f2cd35f13f` into PR head `8e44c247ad03539de038fb82811f10e6a8ebc86a` (chief dr dirty-head round).

## Change (hard round tier 1, Gate B fail ec64acf4)
- Root cause: per-emoji `translateY` nudges (especially 📅 at 1.05px) plus dropping `top:0px` on `tsPaintTabEmoji` moved Day-by-Day tab ink ~2.1px vs label while merge-base `7bc66068` was ~0.25px; Gate B `daybyday-390-top.png` vision flagged the tab calendar chip. Timeline wrapper had dropped `data-ts-category-tab-icon`, shifting Macy's row ink vs base on earlier heads.
- `src/vacation/trek-tab-icon-center-patches.mjs`: restore merge-base `tsPaintTabEmoji` (ink mass centering + `top:0px`, no nudge map); keep Lucide category-tab `translateY(0.75px)` patch only; strip any prior nudge suffix when rebaking.
- `src/vacation/trek-live-product-patches.mjs`: restore timeline `data-ts-category-tab-icon` on `TIMELINE_ICON_PATCH` to match `7bc66068`.
- Rebaked `public/assets/index-BKun7ofk.js` (`tsPaintTabEmoji` byte-identical to base; +Lucide tab patch only).

## Gate B context
- Prior fail run `20261021-215421`, head `ec64acf4`: `daybyday-390-top.png` (tab calendar chip), `stores-1280.png` (vision header flake; `stores-1280-top.png` PASS at same pixel diff).

## Local verification (tip `ba720b10`, merge `446e1913` into `8e44c247`)
- `node scripts/rebake_served_trek_bundle.mjs` — pass
- `CHROME_PATH=/usr/bin/chromium-browser npm test` (apps/vacation-client) — pass
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — pass
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs` — pass
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — pass
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass

## Lane offline suite gap (not product)
- `node scripts/run-offline-tests.mjs` stops at `scripts/test_live_transcript_dialog_pdf.mjs`: with `gbrain` on PATH, `rules.via` is `gbrain-cli-get_page` (test expects `bundled-get_page`); without gbrain, `pdftotext` is missing on this host. Host CI is authority.

## Out of scope / not run here
- Ubuntu Gate B re-capture on new head (required for Done).
