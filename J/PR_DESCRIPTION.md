Closes #884

## Summary

Fixes logo chips that left the category fallback emoji (`.tsv-logo-fallback`, e.g. hotel suitcase) visible on top of a loaded brand `img` — TownePlace detail showed suitcase-over-Marriott after the Marriott favicon painted.

- Trek `dc()` patch: fallback hidden until load fails; `onLoad` / ref hide fallback when `naturalWidth > 1`; ink-center path also hides fallback on successful paint (`thing-logo-ink-center.mjs`, `thing-logo-fallback-url.mjs`).
- Vacation-client `logoChipHandlers.mjs`: same hide-on-load / show-on-final-error contract for detail and list chips.
- Gate B DOM audit: `fallback_stack` when a loaded img and visible fallback coexist (`shared-trip-logo-audit.mjs`).
- Rebaked `public/assets/index-BKun7ofk.js` via `scripts/rebake_served_trek_bundle.mjs` (sha256 `9183847c5fa72e9d7696dfdbb3b6f3b3128bfe37d97f097bd1457fe81a1f27aa`).

**vk base merge (same commit):** trip 99 stand-in fixture/replay + capture guard from #901 on the staged index; see `J/RECEIPT.md` — not #884 UI scope.

## Test plan

- [x] `node scripts/test_ui_884_logo_chip_fallback_hide.mjs`
- [x] `node scripts/test_shared_logo_chip_center_bundle.mjs`
- [x] `node scripts/test_shared_trip_live_tab_logos.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`
- [ ] CI on pushed head (`e1307ba6` + host merge commit)
- [ ] Gate B structure (logo-chip allowance for TownePlace; `fallback_stack` probe)

## Left alone (scope)

- `hold:test-trip fixture` — Marriott `logoUrl` replay vs live is data/harness, not this stacking fix.
- Baselines, Gate B thresholds, workflows, `package.json`, deploy config.
- Broader favicon upscaling beyond Marriott 16px → gstatic repair.
