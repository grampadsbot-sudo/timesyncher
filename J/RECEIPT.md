# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, rethink round)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr brief 2026-10-21 6:55 PM PT).

**Start sha:** `8b2ba628b2520ced218d4af903028c0870bd3667`

## Change

1. Reverted `OE_ROW_SR_LOGO_ALIGN_*` flex row in `shared-trip-oe-list-row-patch.mjs` (row/name axis back to base `e3364ac` grid).
2. Per-image ink centring: `thing-logo-ink-center.mjs` injects `tsCenterThingLogoInk` into served TREK bundle; `dc()` `tiny-logo` images get onLoad/ref ink-bbox `translateY` inside the chip only.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Rethink approach landed; not self-certified. CI + Ubuntu Gate B structure on pushed head decide PASS/FAIL.

**Tip sha:** `a14982b9e4f46c275990067df5e3b388796dd631`
