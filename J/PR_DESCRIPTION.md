Closes #601

## Summary

- Hard round (Gate B fail `cad653f5`): head matched PR base `e3364ac` on product files (docs-only diff), so pre-merge `known_gaps` rejected with **backend-only / changes no screen** (`tsv_dispatch.py` `record_backend_skip`).
- Re-apply the round-1 `Oe()` `sr` flex row: 28×28 `dc` slot + `data-ts-list-row-name` cell with `minHeight:28` / flex vertical center so logo ink and the first `strong` name line share one axis (closes known gap **other** / `logo not centred with name` on base `e3364ac`).
- Rebake `public/assets/index-BKun7ofk.js`; assert patch in `scripts/test_itinerary_fresh_daybyday_bundle.mjs`.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B/capture scripts, baselines, workflows, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).
