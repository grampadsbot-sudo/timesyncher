# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, 2026-10-22)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (rethink + dirty-head base merge).

**Start sha:** `62d8924384d0410c444cf4304386752482b31209`  
**Base merge:** `origin/migrate/trek-source` @ `6800a3b34e9a9773734f52e1526326b3961d463b` (includes #621 Motto snapshot key `676`).

## Change

1. **Offline logo ink offsets:** `scripts/build_thing_logo_ink_offsets.mjs` decodes each list-tab logo URL (ImageMagick, Gate B ink-bbox threshold 24) into `src/vacation/thing-logo-ink-offsets.json`. `dc()` applies fractional `translateY` from the table toward `[data-ts-list-row-name]` — no runtime canvas.
2. Rebaked `public/assets/index-BKun7ofk.js` via `node scripts/rebake_served_trek_bundle.mjs`.
3. Merged base fixture/test updates for #621 without changing PR #601 row layout.

## Local verification

| Check | Result |
| --- | --- |
| `node scripts/build_thing_logo_ink_offsets.mjs` | pending |
| `node scripts/rebake_served_trek_bundle.mjs` | pending |
| `node scripts/test_thing_logo_ink_center.mjs` | pending |
| `cd apps/vacation-client && npm test` | pending |
| `node scripts/check-no-comments.mjs` | pending |
| `node scripts/test_offline_manifest.mjs` | pending |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pending |

## Verdict

Not self-certified; CI + Gate B gap_close on published head are authority.

**Tip sha:** (filled at DONE)
