Closes #902

# PR #906 — customer build stamp hide + vk base merge (#884 / #927 / #905 / #903 carry)

Hide the customer-visible build-stamp bar on every page while keeping machine-readable build id (`<meta name="timesyncher-build">` and `/api/version`). The DOM footer with the 7-char sha remains for probes; CSS hides it unless `?debug=1`.

Host base-merge (`origin/vk` @ `ed8687b9` into PR branch @ `7b96b969`): vk trip shell / #905 chat-itinerary paths, #927 touch splitter + collapsible shared-trip hero, #884 logo-chip fallback hide, #903 stored-data/live-QA paths, plus #902 stamp hide. **`shared-app.html`:** vk `#root` flex shell + hide rules on `footer[data-build-stamp="1"]` (vk `position:static` on the stamp dropped — it brought back the dark bar).

## #902 changes

- Inline `timesyncher-build-stamp-style` + `public/ts-build-stamp-customer-hide.{css,js}` on static shells (`routes/version.mjs`, `vite.config.mjs`).
- React `BuildStampFooter` + **`apps/vacation-client/src/styles.css`**: bundled trip client hides `.tsv-build-footer` by default; debug query shows the fixed bar.

## #903 (vk merge — stored data)

- **`live-qa-903-presentation.mjs`:** Dropped serve-time title/narrative rewrites; kept non-destructive polish (ratings, cited stars, trip-month hours, flight time backfill).
- Fixture rows 609/630–634 carry customer wording in stored source rows (`nyc-craig-kim-daybyday-rows.mjs`).
- `GATE_B_DISPLAY_TITLE_ALIASES[609]` retained for ccab provenance.

## #884 (vk merge — logo chip fallback)

Fixes logo chips that left the category fallback emoji (`.tsv-logo-fallback`) visible on top of a loaded brand `img` after favicon paint.

- Trek `dc()` patch + ink-center / fallback-url handlers; vacation-client `logoChipHandlers.mjs` hide-on-load contract.
- Gate B DOM audit: `fallback_stack` in `shared-trip-logo-audit.mjs`.
- Rebaked `public/assets/index-BKun7ofk.js` via `scripts/rebake_served_trek_bundle.mjs`.

## Inherited from `origin/vk` merge (keep both behaviours)

- #927: iOS finger-drag on vacation-app site/chat splitter; collapsible shared-trip hero (`public/ts-trip-hero-collapse.js`, mobile-only mount).
- #905: chat-itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride`).
- Budget price parity with list tabs (`budgetModel.mjs` / `numericPrice`).

## Verification

- [x] `node scripts/test_build_stamp_customer_hidden.mjs`
- [x] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs`
- [x] `node apps/vacation-client/test/shell-layout.mjs`
- [x] `node scripts/test_ui_884_logo_chip_fallback_hide.mjs`
- [x] `node scripts/test_shared_logo_chip_center_bundle.mjs`
- [x] `node scripts/test_shared_trip_live_tab_logos.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `node scripts/test_pr336_ccab_search_provenance.mjs`
- [x] `node scripts/test_shared_tab_list_summary.mjs`
- [x] `node scripts/test_vacation_app_927_touch_splitter.mjs`
- [x] `node scripts/test_vacation_app_927_hero_collapse.mjs`
- [x] `node scripts/test_vacation_app_shell.mjs`, `node scripts/test_shared_trip_boot_fetch.mjs`
- [x] `node scripts/test_chat_itinerary_edit.mjs`, `node scripts/test_chat_itinerary_edit_905.mjs`
- [x] `node apps/vacation-client/test/budget.unit.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`
- [ ] CI on host-pushed head after merge commit (ref `7b96b969`+)
- [ ] Gate B structure: no viewport-visible build sha on hub/lists/detail at 390 and 1280

## Left alone

- Baselines, check config workflows, deploy config, package deps.
- `GATE_B_DISPLAY_TITLE_ALIASES[609]`: removing it breaks `assertGateBRowProvenance` for row 609.
- `hold:test-trip-fixture` — Marriott `logoUrl` replay vs live is data/harness, not a UI stacking fix.
- Live Neon apply for trip 99 SQL (host).
- Chat itinerary edit persist beyond staged merge, fixture/trip data, NYC trip payloads, broader favicon upscaling beyond Marriott repair.
- Rows listed by `vk_contract_check_local.mjs` (692–695 ratings/reviews, 710 logo): not part of this round.
