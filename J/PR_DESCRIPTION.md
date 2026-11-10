Closes #902

## Summary

Hide the customer-visible build-stamp bar on every page while keeping machine-readable build id (`<meta name="timesyncher-build">` and `/api/version`). The DOM footer with the 7-char sha remains for probes; CSS hides it unless `?debug=1`.

Host base-merge (`origin/vk` into PR branch @ `d627872f`): vk trip shell / #905 chat-itinerary paths, #927 touch splitter + collapsible shared-trip hero, plus #902 stamp hide. **`shared-app.html`:** vk `#root` flex shell + hide rules on `footer[data-build-stamp="1"]` (vk `position:static` on the stamp dropped — it brought back the dark bar).

## #902 changes

- Inline `timesyncher-build-stamp-style` + `public/ts-build-stamp-customer-hide.{css,js}` on static shells (`routes/version.mjs`, `vite.config.mjs`).
- React `BuildStampFooter` + **`apps/vacation-client/src/styles.css`**: bundled trip client hides `.tsv-build-footer` by default; debug query shows the fixed bar.

## Inherited from `origin/vk` merge (keep both behaviours)

- #927: iOS finger-drag on vacation-app site/chat splitter; collapsible shared-trip hero (`public/ts-trip-hero-collapse.js`, mobile-only mount).
- #905: chat-itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride`).
- Budget price parity with list tabs (`budgetModel.mjs` / `numericPrice`).

## Test plan

- [x] `node scripts/test_build_stamp_customer_hidden.mjs`
- [x] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs`
- [x] `node apps/vacation-client/test/shell-layout.mjs`
- [x] `node scripts/test_issue_901_trip99_single_venue_standins.mjs`
- [x] `node scripts/test_gate_b_live_replay_display_facts.mjs`
- [x] `node scripts/test_vacation_app_927_touch_splitter.mjs`
- [x] `node scripts/test_vacation_app_927_hero_collapse.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`
- [x] `node scripts/test_vacation_app_shell.mjs`, `node scripts/test_shared_trip_boot_fetch.mjs`
- [ ] CI on pushed PR head `d627872f`+ (see J/RECEIPT.md)
- [ ] Gate B structure: no viewport-visible build sha on hub/lists/detail at 390 and 1280

## Left alone

- Baselines, check config workflows, deploy config, package deps.
- Live Neon apply for trip 99 SQL (host).
- Chat itinerary edit persist beyond staged merge, fixture/trip data, NYC trip payloads.
