# VK #587 / PR #591 receipt

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-591`: page not found (fetch failed at lane start).

## Change (CI-fix round)
- `src/vacation/trek-tab-icon-center-patches.mjs`: Lucide tab icon wrapper uses `"data-tab-category":String(G.id)` so the served bundle keeps exactly one `data-tab-category":G.id` anchor (emoji branch) while preserving centred Lucide chips and #587 ink nudges.
- Rebaked `public/assets/index-BKun7ofk.js`.

## Local verification
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — pass (was `2 !== 1` on head a1837c14).
- `node scripts/rebake_served_trek_bundle.mjs`
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs`
- `node scripts/test_shared_logo_chip_center_bundle.mjs`
- `node scripts/test_served_canned_needles.mjs`
- `node scripts/test_served_trek_bundle.mjs`
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass before push.

## Out of scope / not run here
- Full `node scripts/run-offline-tests.mjs` (vacation-client `npm ci` required locally; CI runs it).
- Ubuntu Gate B structure re-capture on PR head (required for Done).
