# PR543 — list-row logos (vkfill-543-20261020184716)

Outcome: list rows match staging TREK `_l` favicon fallback when `thingOverrides` carry `website`/`url` without `logoUrl`.

## Root cause

`resolveThingLogoUrl` / `pageUrlForLogo` ignored top-level `override.website` and `override.url`. Staging `LIST_LOGO_PATCH` reads those on `ha(G)`; vacation-client `logoUrlForPlace` returned empty for rows that only had override website (9 hotels + event/restaurant rows in Gate B 6:46 PM PT compare on `d377ea9` vs base `218a3b3`).

## Fix

1. `src/vacation/thing-logo-capture.mjs` — `pageUrlForLogo` and `logoCaptureMissReason` include `override.url` / `override.website` / `override.sourceUrl`.
2. `apps/vacation-client/src/lib/listTabModel.mjs` — `logoUrlForPlace` uses `resolveThingLogoUrl` first, then TREK-style raw-logo filter (skip svg placeholders and bound story media).
3. `apps/vacation-client/test/listRows.unit.mjs` — favicon-only event, hotel, and restaurant rows.

## Checks (local)

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `cd apps/vacation-client && npm run typecheck` — pass
- `cd apps/vacation-client && npm test` — pass (layout chrome skipped without CHROME_PATH)
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)
