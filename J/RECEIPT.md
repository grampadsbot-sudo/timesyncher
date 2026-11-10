# PR #939 / #937 — expanded hero title unclip (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Lane start HEAD:** `8da3206c309b82ebed7947ae25240c69d033e6b4` (verified). **Lane:** cursor-ubuntu, composer-2.5. **Authority:** eggbot 3:04 AM PT 11/10 (title clip ship-blocker; wrapping OK; ~32px shorter expanded OK; no expanded one-line or within-8px-height tests).

**GBrain:** `bot-admin/lanes/vk-pr-handoff/pr-939` — page not found on this pass (handoff in job brief only).

## Changes

| Path | Change |
| --- | --- |
| `public/ts-trip-hero-collapse.js` | Expanded `h1`: removed `white-space:nowrap`; use `overflow-wrap:anywhere` so full title is unclipped at 390. Kept CSS grid chevron column, slim collapsed bar, collapsed-only ellipsis. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | Dropped expanded one-line `clientHeight` and expanded height within 8px of ed8687b assertions. Kept zero overlap, collapsed ≤57px, collapsed one-line, `scrollWidth <= clientWidth` expanded, no expanded ellipsis. |

**Out of scope (unchanged):** splitter, chat-edit, conflicts, trip data, `gateb-allow.json`, bundles (standalone `shared-app.html` script).

## Checks

| Command | Result |
| --- | --- |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | FAIL — `apps/vacation-client/node_modules/typescript` missing in worktree; host re-run after deps install |

## Host publish

Uncommitted diff (2 files): `public/ts-trip-hero-collapse.js`, `scripts/test_vacation_app_927_hero_collapse.mjs`. Commit on `vkfill/937-20261110021736`, push once, Gate B hero allowance via eggbot (do not edit `gateb-allow.json` here). Ref: start HEAD `8da3206c`.
