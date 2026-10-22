# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604 rethink round, 2026-10-22)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr option a: emoji fallback centering, generic path).

**Start sha:** `0aa9f367bc2ae845897db28e263e580c958de1c5`

## Change

Center **placeholder / emoji** list-row logo chips on the **first name line** (same target as `~/tsv-gateb/lib/row-name-frame.mjs`), without per-venue code or favicon ink-cache rows:

- `src/vacation/thing-logo-ink-center.mjs`: `tsCenterListLogoFallbackDom` / `tsCenterThingLogoFallback` — canvas ink-bbox (threshold 24) + `translateY` on `.tsv-logo-fallback`; shared `listRowFirstNameLineCenterY` for image ink path too.
- TREK `dc()`: `ref` → `tsCenterThingLogoFallback(Rn)`; fallback span gets `tsv-logo-fallback` class.
- Rebaked `public/assets/index-BKun7ofk.js`.
- `apps/vacation-client` `ListRow` `useLayoutEffect` + `.tsv-logo-fallback` CSS (parity).

## Real-render measurement (headless Chromium)

**Harness:** Playwright chromium `~/.cache/ms-playwright/chromium-1243`, ink-bbox threshold 24, first-line centre from `Range.getClientRects()` (same rule as Gate B `row-name-frame.mjs`), tolerance 1.5 px.

**Attempt:** `shared-app.html` + rebaked `index-BKun7ofk.js` + `scripts/fixtures/gate-b-nyc-shared-staging.json` (share token `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y`) — **blocked:** `li[data-list-row]` did not mount within 60s (local static harness; no staging API). No model-only offsets filed.

**Authority for gap_close on published head:** Ubuntu Gate B structure mode on CI head.

## Local verification

| Check | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 (`sha256=724d45bfd92190186050fa28c852b485f29b6434516fecabb06312aa45edcb4e`) |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && npm test` | 0 (layout chrome skipped: no CHROME_PATH in npm test harness) |

## Tip sha

`8c4e5c33b7d689be969f3138bbdb5766047be4a1` — local commit on lane worktree; host publishes to `vkfill/601-20261021155744`.
