# PR #767 / issue #760 — lane receipt

**Start HEAD (round 1):** `130b2f0506abefc2fdf12a6da8b1845201f40ef4`

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-767` — **page not found** (MCP `get_page` rc1, 2026-11-01).

## CI round 2 fix

**Failure:** `scripts/test_shared_logo_chip_center_bundle.mjs` — still asserted `className:"tiny-logo",src:zt,alt:""` after display-time logo repair landed in the served bundle.

**Fix:** Align test with `test_served_trek_bundle.mjs`: expect `tsRepairExplicitLogoUrl` and `data-logo-src` + repaired `src` on `dc()` chips.

## Checks (local, after round 2)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
