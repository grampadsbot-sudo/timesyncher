Closes #884

## Summary

Fixes logo chips that left the category fallback emoji (`.tsv-logo-fallback`, e.g. hotel suitcase) visible on top of a loaded brand `img` — TownePlace detail showed suitcase-over-Marriott after the Marriott favicon painted.

- Trek `dc()` patch: fallback hidden until load fails; `onLoad` / ref hide fallback when `naturalWidth > 1`; ink-center path also hides fallback on successful paint (`thing-logo-ink-center.mjs`, `thing-logo-fallback-url.mjs`).
- Vacation-client `logoChipHandlers.mjs`: same hide-on-load / show-on-final-error contract for detail and list chips.
- Gate B DOM audit: `fallback_stack` when a loaded img and visible fallback coexist (`shared-trip-logo-audit.mjs`).
- Rebaked `public/assets/index-BKun7ofk.js` via `scripts/rebake_served_trek_bundle.mjs`.

**vk base merge @ `7441bc96`:** `origin/vk` merged by host (`86d90ed`); conflict files `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` resolved this round. Staged vk carry: #927 vacation-app touch splitter + mobile-only hero collapse, budget tab price parity (`budgetModel.mjs`), #925 chat itinerary sequential PUT merge. No `public/assets/*.js` merge conflict; trek rebake unchanged. See `J/RECEIPT.md`.

## Test plan

- [x] `node scripts/test_ui_884_logo_chip_fallback_hide.mjs`
- [x] `node scripts/test_shared_logo_chip_center_bundle.mjs`
- [x] `node scripts/test_shared_trip_live_tab_logos.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `node scripts/test_vacation_app_927_touch_splitter.mjs`
- [x] `node scripts/test_vacation_app_927_hero_collapse.mjs`
- [x] `node apps/vacation-client/test/budget.unit.mjs`
- [x] `node scripts/test_chat_itinerary_edit.mjs`, `node scripts/test_chat_itinerary_edit_905.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`
- [ ] CI + Gate B on host-pushed head after merge commit
- [ ] `node scripts/test_vacation_app_927_webkit_touch_live.mjs` after staging deploy (WebKit touch)

## Scope left alone

- `hold:test-trip-fixture` — Marriott `logoUrl` replay vs live is data/harness, not this stacking fix.
- Chat itinerary edit persist beyond staged #925 merge, trek bundle rebake, fixture/trip data, baselines, Gate B thresholds, workflows, `package.json`, deploy config.
- Broader favicon upscaling beyond Marriott 16px → gstatic repair.
