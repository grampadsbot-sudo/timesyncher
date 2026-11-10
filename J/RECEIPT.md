# TSV #952 — iPhone full screen exit control (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH. **Lane start HEAD:** `9c6b1df2d17c43fc87b29c6a510d391cd447d651`. **Lane:** cursor-ubuntu, composer-2.5. **Authority:** eggbot 7:33 AM PT 11/10 (`eggbot:exit-fullscreen-iphone-20261110-0733`).

## Root cause

`bindFullScreen` toggles `.site-fullscreen`, which sets `.topbar { display: none }`. On 2+ vacation sessions `#fullScreenButton` lives inside the topbar, so iOS/CSS-only full screen hid the only exit control.

## Fix (vacation-app chrome)

1. **`public/vacation-app-request.js`** — On enter full screen, reparent `#fullScreenButton` onto `.app` (outside the hidden topbar); on exit, restore it to the header or splitter slot.
2. **`public/vacation-app-shell.css`** — Fixed top-right exit: `position: fixed`, safe-area insets, `min-width`/`min-height` 44px, `z-index: 10`. Removed bottom-right splitter-row pinning for full screen.
3. **`scripts/layout-app-measure.mjs`** — `fullScreenSource()` asserts exit visible, 44px, and top-right in viewport.
4. **`scripts/test_served_page_layout.mjs`** — Stricter SITE full-screen assertions; new `layout-many-site` harness session + `MANY-SITE-FULLSCREEN` / `MANY-SITE-EXIT` checks (multi-trip header path).
5. **`scripts/layout-shell-harness.mjs`** — `MANY_SITE` session (2 trips, site on active trip).
6. **`.cursor/skills/verify-timesyncher-vacation/scripts/layout-measure.mjs`** — Resolve `#fullScreenButton` as full-screen enter control.

## Uncommitted paths (host commit/push)

| Path |
| --- |
| `public/vacation-app-request.js` |
| `public/vacation-app-shell.css` |
| `scripts/layout-app-measure.mjs` |
| `scripts/layout-shell-harness.mjs` |
| `scripts/test_served_page_layout.mjs` |
| `.cursor/skills/verify-timesyncher-vacation/scripts/layout-measure.mjs` |
| `J/RECEIPT.md` |
| `J/PR_DESCRIPTION.md` |

## Checks (this lane)

| Command | Result |
| --- | --- |
| `node .cursor/skills/verify-timesyncher-vacation/scripts/layout-self-check.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_served_page_layout.mjs` | **BLOCKED** — no Chrome at `/usr/bin/google-chrome-stable` on this worker |
| `node scripts/check-no-comments.mjs` | **BLOCKED** — missing `apps/vacation-client/node_modules/typescript` |

Host should run `test_served_page_layout.mjs` on Ubuntu with Chrome before push/Gate B.

## Scope left alone

NYC demo trip data, #951 pencil/price/chevron, `offline-tests.txt`, baselines, workflows.
