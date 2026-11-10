# Issue #937 — iPhone hero collapse grid + expanded one-line title (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Lane start HEAD:** `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1` (verified). **Lane:** cursor-ubuntu, composer-2.5. **Follow-up:** Gate B `20261110-101435` on PR #938 head `482b246` — keep grid/overlap/collapsed bar; fix expanded title wrap at 390.

## Changes

| Path | Change |
| --- | --- |
| `public/ts-trip-hero-collapse.js` | CSS grid layout: chevron in `toggle` column (no `position:absolute; left:10px`). Collapsed ≤57px bar, details/actions hidden, ellipsis on title only when collapsed. Expanded `h1` at **21px** + `white-space:nowrap` (no ellipsis) so "Craig / Kim NYC June 2026" fits one line beside 44px control at 390. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | Puppeteer @390: zero overlap expanded/collapsed; collapsed height ≤57; one-line collapsed title; **expanded** one-line + `scrollWidth` fit; expanded taller than collapsed. Keeps rgb/#000 findHero regression assertions. |

**Out of scope (unchanged):** splitter, chat-edit, conflicts, trip data, `gateb-allow.json`, bundles (script served standalone via `shared-app.html`).

## Checks

| Command | Result |
| --- | --- |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | **SKIP/FAIL** — `apps/vacation-client/node_modules/typescript` missing in worktree (`MODULE_NOT_FOUND`); host should run after deps install (no comments added in touched files). |

## Host publish

Uncommitted diff: `public/ts-trip-hero-collapse.js`, `scripts/test_vacation_app_927_hero_collapse.mjs`. If publishing atop PR #938 (`482b246`), apply as delta on that branch (grid/collapse tests already present there; this round is primarily expanded `font-size:21px` + expanded one-line assertions). `Closes #937` on single PR into `vk`.
