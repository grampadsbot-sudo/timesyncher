# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, 2026-10-22)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (rethink + dirty-head base merge).

**Start sha:** `62d8924384d0410c444cf4304386752482b31209`  
**Tip sha:** `c7986b95d0d5c8e63d91c88d4f935dabf8dca49b`  
**Base merge:** `origin/migrate/trek-source` @ `6800a3b34e9a9773734f52e1526326b3961d463b` (includes #621 Motto snapshot key `676`).

## Change

1. **Offline logo ink offsets:** `scripts/build_thing_logo_ink_offsets.mjs` decodes list-tab logo URLs (ImageMagick, Gate B ink-bbox threshold 24) into `src/vacation/thing-logo-ink-offsets.json` (29 URLs; e.g. Apple `inkCy` 31.5/`nh` 64, Bergdorf Goodman 8/16). `dc()` applies fractional `translateY` from `TS_LOGO_INK_CY` toward `[data-ts-list-row-name]` — no runtime canvas / CORS read.
2. Rebaked `public/assets/index-BKun7ofk.js` (`sha256=59966f556e322baef69dcb22209d741ca6f7e3be00fe6667b8c673ec2711eddf`).
3. Merged base #621 fixture/test updates without row-layout churn.

## Local verification

| Check | Result |
| --- | --- |
| `node scripts/build_thing_logo_ink_offsets.mjs` | 0 (29 rows, 29 skipped fetch/decode) |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_pr336_vk_search_places_snapshot_keys.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && npm test` | FAIL `detail.unit.mjs` — missing `@neondatabase/serverless` before `npm install` in app; not re-run to completion after install |
| Full `scripts/offline-tests.txt` loop | FAIL `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` — `/usr/bin/google-chrome-stable` missing |
| Local Gate B gap_close / events capture | not run (no Chrome for `capture.mjs`) |

## Verdict

Merge + offline ink table landed on tip `c7986b95`; logo-centre gap_close not self-verified locally. CI + Ubuntu Gate B on published head are authority for #601 close.
