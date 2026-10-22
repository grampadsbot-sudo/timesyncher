Closes #601

## Summary

- Revert the round-4 `Oe()` `sr` flex/grid axis change so list-row name/text matches base `e3364ac` (grid `28px + name` unchanged).
- Per-logo vertical ink centring in `dc()`: offline ink-bbox table keyed by logo URL (threshold 24, full-resolution decode) plus fractional `translateY` toward the first name line (`[data-ts-list-row-name]`, Gate B name-frame). No runtime canvas read (avoids CORS taint and sub-pixel overshoot from downsampled ink reads).
- `src/vacation/thing-logo-ink-center.mjs` + `src/vacation/thing-logo-ink-offsets.json` (built via `node scripts/build_thing_logo_ink_offsets.mjs`); rebaked `public/assets/index-BKun7ofk.js`.
- Base merge: host merged `origin/migrate/trek-source` @ `6800a3b` into `62d89243` (2026-10-22 cursor-ubuntu vkfill-604 dirty-head requeue); #621 Motto snapshot `id` fix and `pr336SnapshotRowIdKey` guard from base included.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/build_thing_logo_ink_offsets.mjs` — 0
- `node scripts/test_thing_logo_ink_center.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_pr336_vk_search_places_snapshot_keys.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B scripts, `gateb-allow.json`, baselines, workflows, row `sr` layout, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr rethink brief 2026-10-22 2:45 AM PT). CI + Gate B on pushed head are authority.
