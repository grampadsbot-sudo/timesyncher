Closes #601

## Summary

- Gate B `logo not centred with name` on shared-trip list tabs: `Oe()` used a 28px grid with `alignItems:"center"`, which vertically centred the logo chip against the full title cell (e.g. hotel name + price), not the first name line.
- Replace that row header with a 28px logo slot (`dc` at size 28) and `alignItems:"start"` on the logo+name grid so the chip top-aligns with the first name line. Round 2 drops the flex/`minHeight:28` name cell (it shifted list text vs PR base `e3364ac` in pre-merge Gate B pixel compare without improving name-line offsets on the NYC fixture).
- Rebake `public/assets/index-BKun7ofk.js`.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_gate_b_live_tab_logo_rows.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Gate B note (not self-certified)

- Pre-merge compare run `20261021-232628` on head `5e40bf0c` failed pixel+vision vs base `e3364ac` on the 14 list-tab screens named in the kickback (layout delta from the list-row axis change). Structure name-line checks on captured `events-390-top` / `hotels-390-top` rows match base except pre-existing Apple Fifth Avenue −1.5px; authority for close remains CI + Gate B on the new head.

## Left alone (scope)

- Gate B/capture scripts, baselines, `gateb-allow.json`, workflows, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).
