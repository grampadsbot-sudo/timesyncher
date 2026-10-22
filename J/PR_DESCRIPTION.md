Closes #601

## Summary

- Revert the round-4 `Oe()` `sr` flex/grid axis change so list-row name/text matches base `e3364ac` (grid `28px + name` unchanged).
- Per-logo vertical ink centring in `dc()`: on load (deferred off the React commit path), measure each image’s ink bbox (downsampled canvas, threshold 24) and apply `translateY` so ink centre aligns with the chip centre without moving chip size/position or row layout. Fixes 390px Gate B tab-capture regression from synchronous canvas work in `ref`/load handlers.
- New module `src/vacation/thing-logo-ink-center.mjs` + `scripts/test_thing_logo_ink_center.mjs` (asymmetric padded bar fixture); rebaked `public/assets/index-BKun7ofk.js`.
- Base merge: host merged `origin/migrate/trek-source` @ `6edb0791` into `ebe2e5aa` (2026-10-22 cursor-ubuntu vkfill-604 dirty-head requeue); base #619 fixture copy fixes merged in tree.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_thing_logo_ink_center.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B scripts, `gateb-allow.json`, baselines, workflows, row `sr` layout, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr rethink brief 2026-10-21 6:55 PM PT). CI + Gate B on pushed head are authority.
