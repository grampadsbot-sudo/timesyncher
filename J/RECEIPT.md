# PR #762 / issue #760 — lane receipt

**Start HEAD:** `ffdb715ab597e3bd318a7be92b3973d71e631b41`

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-762` — **page not found** (MCP `get_page` rc1, 2026-10-31).

## CI round 2 fix

**Failure:** `scripts/test_gate_b_product_row_fields.mjs` — place 604 `logoUrl` must stay `https://statuecitycruises.com/favicon.ico` (pr336 snapshot), not DuckDuckGo ip3.

**Cause:** Round 1 repaired logos inside `resolveThingLogoUrl`, which `applyLiveAppListRowFields` writes into `thingOverrides.logoUrl`.

**Fix:** Split canonical vs display:

- `resolveThingLogoUrl` — unchanged stored URL (official favicon in overrides).
- `resolveThingLogoDisplayUrl` — `repairExplicitLogoUrl` for img/`_l()` only.
- `buildListLogoPatch()` — embeds `EXPLICIT_LOGO_REPAIRS` in served bundle `_l()`.
- Live tab HTML: `data-logo-src` = canonical, `<img src>` = display.

## Checks (local)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_thing_logo_fallback_758.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
