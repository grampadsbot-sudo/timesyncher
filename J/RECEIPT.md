# PR543 — list logos and stores tab (vkfill-543-20261020182727)

Outcome: dr eggbot 2026-10-20 4:45 PM PT brief (`~/tsv-dispatch/auto-filler/briefs/543.md`). Product fix `02ef6a926ce06dfb9edbd53e2988c465a7c30db8` (host publish / CI / Gate B on lane tip in `vkfill-543-DONE`).

## Changes (02ef6a92)

1. **Row logos** — `logoUrlForPlace` calls `resolveThingLogoUrl` (same chain as staging TREK / `thing-logo-capture.mjs`) before explicit override/place/source fields.
2. **Stores tab** — Deduplicate stores by normalized name (keep lower-priced row on name collision). Default sort for stores is **price** ascending (cheapest-first).

Files: `apps/vacation-client/src/lib/listTabModel.mjs`, `apps/vacation-client/src/screens/CategoryTabScreen.tsx`, `apps/vacation-client/test/listRows.unit.mjs`.

## Checks (local, vkfill-543-20261020182727)

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `cd apps/vacation-client && npm run typecheck` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)

## Left alone (scope)

- List long-description vs itinerary summary (16:03 PT ruling) — unchanged.
- Checker, fixtures, baselines, `vercel.json`, dependencies — not touched.
