# PR543 — list logos and stores tab (vkfill-543-20261020172727)

Outcome: fix for dr eggbot 2026-10-20 4:45 PM PT brief (`~/tsv-dispatch/auto-filler/briefs/543.md`). Product fix `02ef6a926ce06dfb9edbd53e2988c465a7c30db8`; lane tip `1a2e25d6a9b7337adb9dda48d775a985440c40f6` (receipt commit, host publish). CI and Gate B on the published head are for the host; not claimed here.

## Changes

1. **Row logos** — `logoUrlForPlace` calls `resolveThingLogoUrl` (same resolution chain as staging TREK / `thing-logo-capture.mjs`) before explicit override/place/source fields, so website-derived and brand-name logos render again on list rows that only had URL-based resolution on staging.
2. **Stores tab** — Deduplicate store places by normalized name (keep the lower-priced row when names collide). Default sort for stores is **price** ascending (cheapest-first), same as flights/hotels/cars.

Files: `apps/vacation-client/src/lib/listTabModel.mjs`, `apps/vacation-client/src/screens/CategoryTabScreen.tsx`, `apps/vacation-client/test/listRows.unit.mjs`.

## Checks (local, lane tip `1a2e25d6`, 2026-10-21 UTC)

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `cd apps/vacation-client && npm run typecheck && npm run test` — pass (unit; shell-layout skipped without CHROME_PATH)
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)

## Left alone (scope)

- List long-description vs itinerary summary behavior (16:03 PT ruling) — unchanged.
- Checker, fixtures, baselines, `vercel.json`, dependencies — not touched.
- No merge/rebase from this lane.
