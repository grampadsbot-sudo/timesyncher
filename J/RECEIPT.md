# PR #543 lane vkfill-543 (cursor-ubuntu)

## Change (on top of ac2bc4ec)
Restored vacation-client shared-trip parity with staging TREK for Gate B structure failures diagnosed on head `31b0f587` (chief-dr brief 2026-10-20):

- Day-by-Day: airport transfer legs (`Travel to airport` / `Travel from airport`) and flight timeline titles (`airportTransferLegs.mjs`, `dayTimelinePresentation.mjs`); unit coverage for Southwest `Flight option:` row.
- Lists: `logoUrlForPlace` on list rows (fixture/override logos), default price sort for flights/hotels/cars, catalog order for stores/restaurants/events.
- Timeline: single-line time uses the same strut line-box as TREK ruling 48 (`data-ts-timeline-time` + `data-ts-timeline-time-line`) instead of grid-only baseline CSS.

## Checks (local)
- `node apps/vacation-client/test/dayTimeline.unit.mjs` — pass
- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass

## Not verified here
- CI green on pushed PR head (host publish from this worktree)
- Ubuntu Gate B structure 32/32 (required for done)

## Left alone (scope)
- Fixtures, baselines, Gate B scripts, `vercel.json`, `vite.config.mjs`, `package.json` / lockfile
