# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, 390 tab regression)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (kickback 2026-10-22 12:15 AM PT).

**Start sha:** `b77d36b128dbf7ffd15880071af344b5f9a118ad`

## Change

Gate B on `b77d36b` missed Cars/Restaurants/Stores/Events/Budget tabs at 390px (main thread blocked during capture). Root cause: synchronous per-logo canvas ink scan in `dc()` `ref` + `onLoad` on the served bundle.

1. `src/vacation/thing-logo-ink-center.mjs`: queue ink measurement on `requestAnimationFrame` (fallback `setTimeout(0)`), wrap canvas reads in try/catch, downsample large logos for bbox scan, drop sync `ref` from `dc()` (onLoad only).
2. `node scripts/rebake_served_trek_bundle.mjs` — rebaked `public/assets/index-BKun7ofk.js`.

Ink-centre behaviour unchanged in intent; layout/row `sr` untouched.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Fix pushed for host publish. Not self-certified; CI + Gate B on published head are authority.

**Tip sha:** `5a60da93e7b81cd30cb874682a06b3ea30167994`
