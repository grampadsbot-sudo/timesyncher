Closes #587

## Summary

Gate B on `migrate/trek-source` reported vacation tab emoji icons (Day-by-Day, Stores, Budget) vertically off label ink (>0.5 px). Product patches in `trek-tab-icon-center-patches.mjs` and `trek-live-product-patches.mjs` keep a **single** `data-tab-category` anchor in the served bundle while centring Lucide category-tab icons; `tsPaintTabEmoji` matches merge-base ink mass + `top:0px` (no per-emoji nudge map that blew Day-by-Day tab chip on Gate B).

Merged current `migrate/trek-source` at `446e1913` into the PR branch (chief dr dirty-head round): kept #587 tab work, took base bundle then `node scripts/rebake_served_trek_bundle.mjs`, and integrated #589 default list-row `<strong>` wrap from `shared-trip-oe-list-row-patch.mjs`.

## Checks (local, tip `ba720b10`)

- `CHROME_PATH=/usr/bin/chromium-browser npm test` (apps/vacation-client) — 0
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — 0
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- Pre-DONE: `check-no-comments`, `test_offline_manifest`, `check-code-ratchet` (`migrate/trek-source` and `codex/ruling95-consolidated-logo`) — 0

## Left alone (scope)

Baselines, Gate B/capture scripts and thresholds, `scripts/offline-tests.txt`, workflows, deploy config, dependencies, NYC fixture literals. Full `run-offline-tests.mjs` not green on this lane: `test_live_transcript_dialog_pdf.mjs` uses `gbrain` when on PATH (expects `bundled-get_page`) and needs `pdftotext` (poppler-utils not installed here); CI is authority.
