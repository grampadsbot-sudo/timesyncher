Closes #601

## Summary

- Finish host merge of `migrate/trek-source` @ `93ac0a3` into `7a82b21f` (conflicts: J docs + rebaked TREK bundle).
- Fix Gate B **gap_close** on emoji/placeholder logo chips: generic `translateY(-2.5px)` on the fallback glyph inside `dc()` (and matching live-tab / vacation-client CSS). Drops ineffective runtime `tsCenterThingLogoFallback` DOM nudge; per-URL favicon ink `translateY` for real logos unchanged.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_thing_logo_ink_center.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B scripts/thresholds, baselines, workflows, dependencies, flight-price data gaps noted on handoff.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr option a, 2026-10-22). CI + Ubuntu Gate B structure on pushed head are authority.
