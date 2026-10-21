# VK #587 receipt — centred tab logos (migrate/trek-source)

## Change
- `src/vacation/trek-tab-icon-center-patches.mjs`: per-emoji canvas `translateY` nudges (Day-by-Day, Stores, Budget) after ink-mass centering; stop forcing `top:0` on tab chips; wrap Lucide tab icons in centred logo-chip spans.
- `src/vacation/trek-live-product-patches.mjs`: call `patchTabIconVerticalCenter` from served bundle patcher.
- Rebaked `public/assets/index-BKun7ofk.js`.

## Local verification
- `node scripts/rebake_served_trek_bundle.mjs`
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs`
- `node scripts/test_shared_logo_chip_center_bundle.mjs`
- `node scripts/test_gate_b_live_tab_logo_rows.mjs`
- `CHROME_PATH=/snap/bin/chromium node /home/ubishere9995/tsv-work/vkfill-587-job/measure-nyc-tab-ink.mjs` — Day-by-Day / Stores / Budget tab-box ink within 0.5px on NYC fixture at 1280 and 390 (pre-fix baseline failed all three).
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass at commit tip below.

## Out of scope / not run here
- Ubuntu Gate B structure re-capture on PR head (required for Done).
- CI on PR head.
