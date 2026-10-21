# VK #587 / PR #591 receipt

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-591`: page not found (fetch failed at lane start).

## Change (hard round / Gate B tier 1 on a0e0f306)
- Root cause: `tsPaintTabEmoji` translateY nudges were gated on `data-ts-category-tab-icon`, but timeline rows used the same attribute (`TIMELINE_ICON_PATCH`), so Day-by-Day list ink (Macy's row) drifted while tab chips still needed nudges.
- `src/vacation/trek-tab-icon-center-patches.mjs`: gate per-emoji nudges on `data-tab-category` (category tab chips only); migrate off the old tab-icon attribute guard.
- `src/vacation/trek-live-product-patches.mjs`: drop `data-ts-category-tab-icon` from timeline icon wrapper so timeline canvases are not treated as category tabs.
- Rebaked `public/assets/index-BKun7ofk.js`.

## Gate B context (prior fail run `20261021-212417`, head `b02f906c`)
- FAIL vision on `daybyday-390-top.png` (timeline store row icon) and `stores-1280.png` (vision header flake; `stores-1280-top.png` PASS at same pixel diff).

## Local verification
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — pass
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs` — pass
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/rebake_served_trek_bundle.mjs`
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — run before DONE.

## Out of scope / not run here
- Full `node scripts/run-offline-tests.mjs` (CI).
- Ubuntu Gate B re-capture on new head (required for Done).
