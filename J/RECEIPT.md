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

## Local verification
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — pass
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs` — pass
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/rebake_served_trek_bundle.mjs`
- Pre-DONE at `04e3683c`: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (after `npm ci` + `apps/vacation-client/npm ci`)

## Out of scope / not run here
- Ubuntu Gate B re-capture on new head (required for Done).
