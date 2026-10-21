Closes #579

## Summary

Day-by-day Leaflet map markers with `logoUrl` favicons were constrained to a **30×30** shell (`overflow:hidden`) and **26×26** `object-fit:contain` inner image so 64px+ bitmaps no longer cover the map. Map pins use **`data-ts-map-marker-logo` only** (not `data-ts-logo-chip`) so capture does not score pins as list-row logo chips.

This round merged current `migrate/trek-source` (`c1b7b286`) into the PR branch: resolved `J/RECEIPT.md` and `J/PR_DESCRIPTION.md` only (docs conflict with #585). Product fix unchanged (`dab52f74` marker sizing).

## Test plan

- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs`
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
- [x] `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs`

## Left alone (scope)

Baselines, Gate B / capture scripts and allowlists, workflows, `scripts/offline-tests.txt`, deploy config, dependencies, NYC fixture literals, list-tab `_l()` chain beyond map-marker sizing. Base merge brought in #585 budget harness files auto-merged; not edited this round.
