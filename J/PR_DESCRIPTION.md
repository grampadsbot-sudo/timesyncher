Closes #601

## Summary

- Revert the round-4 `Oe()` `sr` flex/grid axis change so list-row name/text matches base `e3364ac` (grid `28px + name` unchanged).
- Per-logo vertical ink centring in `dc()`: on load, measure each image’s ink bbox (canvas, threshold 24) and apply `translateY` so ink centre aligns with the chip centre without moving chip size/position or row layout.
- New module `src/vacation/thing-logo-ink-center.mjs` + `scripts/test_thing_logo_ink_center.mjs` (asymmetric padded bar fixture); rebaked `public/assets/index-BKun7ofk.js`.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_thing_logo_ink_center.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B scripts, `gateb-allow.json`, baselines, workflows, row `sr` layout, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr rethink brief 2026-10-21 6:55 PM PT). CI + Gate B on pushed head are authority.
