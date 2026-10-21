# VK #587 / PR #591 receipt

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-591`: page not found (fetch failed at lane start).

## Change (Gate B round 2 on b02f906c)
- `src/vacation/trek-tab-icon-center-patches.mjs`: apply per-emoji `translateY` nudges only when `chip.getAttribute("data-ts-category-tab-icon")` is set so timeline row canvases (e.g. store rows on Day-by-Day) stay pixel-identical to base while tab icons keep #587 ink nudges.
- Rebaked `public/assets/index-BKun7ofk.js`.

## Gate B context (run `20261021-212417`, head `b02f906c`)
- FAIL vision on `daybyday-390-top.png` (Macy's row icon drift) and `stores-1280.png` (header flake); root cause for day-by-day was unguarded nudge on shared `tsPaintTabEmoji` timeline ref.

## Local verification
- `node scripts/test_shared_tab_category_css_blast_radius.mjs` — pass
- `node scripts/test_shared_category_tab_icon_center_bundle.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/rebake_served_trek_bundle.mjs`
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass before DONE.

## Out of scope / not run here
- Full `node scripts/run-offline-tests.mjs` (needs `npm ci` + Chrome; CI runs it).
- Ubuntu Gate B re-capture on new head (required for Done).
