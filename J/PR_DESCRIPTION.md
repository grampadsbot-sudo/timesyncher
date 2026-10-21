Closes #579

## Summary

Day-by-day Leaflet map markers with `logoUrl` favicons were constrained to a **30×30** shell (`overflow:hidden`) and **26×26** `object-fit:contain` inner image so 64px+ bitmaps no longer cover the map. Map pins use **`data-ts-map-marker-logo` only** (not `data-ts-logo-chip`) so capture does not score pins as list-row logo chips.

This round merged `migrate/trek-source` into the PR branch: resolved `J/RECEIPT.md`, took base `public/assets/index-BKun7ofk.js`, then `node scripts/rebake_served_trek_bundle.mjs` so the served bundle includes base flight `rr()` changes and the #579 marker patch from `src/vacation/trek-live-product-patches.mjs`.

## Test plan

- [x] `node scripts/rebake_served_trek_bundle.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs`
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
- [x] `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs`

## Left alone (scope)

Baselines, Gate B / capture scripts and allowlists, workflows, `scripts/offline-tests.txt`, deploy config, dependencies, NYC fixture literals, list-tab `_l()` chain beyond map-marker sizing.
