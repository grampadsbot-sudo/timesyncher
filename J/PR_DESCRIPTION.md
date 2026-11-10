Closes #927

## Summary

- Fix real iOS finger-drag on the vacation-app site/chat splitter: 44px touch target, non-passive `touchstart`/`touchmove`, drag shield overlay, and iframe `pointer-events` isolation while dragging (desktop pointer drag unchanged).
- Add collapsible black shared-trip hero (expanded default, per-slug `localStorage`, three icon buttons remain visible) via `public/ts-trip-hero-collapse.js` on standalone and embedded shared pages.
- Register offline regression tests and a WebKit+iPhone live touch check (`scripts/test_vacation_app_927_webkit_touch_live.mjs`).

## Test plan

- [x] `node scripts/test_vacation_app_927_touch_splitter.mjs`
- [x] `node scripts/test_vacation_app_927_hero_collapse.mjs`
- [x] `node scripts/test_vacation_app_865_chrome.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=vk node scripts/check-code-ratchet.mjs`
- [ ] `node scripts/check-no-comments.mjs` (host after `npm ci`)
- [ ] `node scripts/test_vacation_app_927_webkit_touch_live.mjs` after staging deploy (WebKit touch, not mouse)
- [ ] CI + Gate B on PR head

## Scope left alone

Chat itinerary edit persist (#925/#926), trek bundle rebake, fixture/trip data, baselines, and NYC trip 99 payloads.
