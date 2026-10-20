# PR #543 lane vkfill-543 (cursor-ubuntu)

## Change
Restored vacation-client shared-trip parity with staging TREK for Gate B structure failures on head `31b0f587`:

- Day-by-Day: airport transfer legs (`Travel to airport` / `Travel from airport`) and flight timeline titles aligned with product bundle behavior (`airportTransferLegs.mjs`, `dayTimelinePresentation.mjs`).
- Lists: serve `override.logoUrl` and fixture logos again (dropped `resolveThingLogoUrl` gate on list rows); default price sort for flights/hotels/cars; catalog order for stores/restaurants/events.
- Timeline: single-line time baseline alignment (`data-ts-timeline-time`, CSS baseline row classes) for ruling 48 checker.

## Checks (local)
- `node apps/vacation-client/test/dayTimeline.unit.mjs` — pass
- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass

## Not verified here
- CI green on pushed PR head
- Ubuntu Gate B structure 32/32 (required for done)

## Left alone (scope)
- Fixtures, baselines, Gate B scripts, `vercel.json`, `vite.config.mjs`
