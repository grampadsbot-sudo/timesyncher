Closes #952

## Summary

- Reparent `#fullScreenButton` onto the app shell when entering CSS full screen so the exit control is not inside `display: none` topbar (multi-vacation iPhone case).
- Style fixed top-right exit with safe-area insets and 44×44 tap target while full screen.
- Extend layout harness/tests for single-trip and multi-trip full-screen enter/exit.

## Why

On iOS, full screen is `.site-fullscreen` only (no Fullscreen API). Hiding the topbar hid the only exit button for NYC-style multi-trip sessions.

## Checks

- `node .cursor/skills/verify-timesyncher-vacation/scripts/layout-self-check.mjs` — PASS on lane worker
- `node scripts/test_served_page_layout.mjs` — host Ubuntu + Chrome (not run on lane worker: no browser)

## Left alone (scope)

#951 UI, trip 99 / NYC fixture data, offline manifest entry (extended existing layout test only).
