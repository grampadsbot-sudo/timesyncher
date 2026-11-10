Closes #888

## Summary

**#888 layout:** conflict badges and trip switcher wrap (no ellipsis); flight time chips show full arrival/depart text; dates render as `Jun 23–30, 2026`; one font weight on chips.

**flights @390 (Defects A+B):** In `apps/vacation-client/src/styles.css` `@media (max-width: 480px)`, multi-row `.tsv-row-flight-main` (no single-row five-column grid, no logo-chip `margin-top`) so arrival times stay inside the card and airline logo chips match base `1ffd23c`.

**#884 (vk merge carry):** logo chips hide `.tsv-logo-fallback` after brand `img` loads (`thing-logo-ink-center.mjs`, `thing-logo-fallback-url.mjs`, `logoChipHandlers.mjs`, `shared-trip-logo-audit.mjs`); rebaked `public/assets/index-BKun7ofk.js`.

**Host vk merge @ `f8d4748`:** Conflicts resolved in `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js` (vk bundle + rebake). Staged vk carry: #927 hero/splitter, budget price parity, #925 chat itinerary. See `J/RECEIPT.md`.

## Test plan

- [x] `node scripts/test_issue_888_clipped_text.mjs`
- [x] `cd apps/vacation-client && npm test` (incl. list-layout @390/1280 Flights)
- [x] `node scripts/test_ui_884_logo_chip_fallback_hide.mjs`
- [x] `node scripts/test_shared_logo_chip_center_bundle.mjs`
- [x] `node scripts/test_shared_trip_live_tab_logos.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `node scripts/test_reply_action_claim_d2_paia_save_route.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`, `node scripts/check-hardcoded-content.mjs`
- [ ] CI on published merge commit
- [ ] Gate B structure with `gateb-allow.json["888"]` (pins + flights-390 rows/chips)

## Scope left alone

Baselines, Gate B config/allowlists, fixtures/NYC data, #882/#889/#865 unrelated product paths.
