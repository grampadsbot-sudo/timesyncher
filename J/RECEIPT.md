# PR543 — list logos and stores tab (vkfill-543)

Outcome: local fix for dr eggbot 2026-10-20 4:45 PM PT brief (`~/tsv-dispatch/auto-filler/briefs/543.md`); starting HEAD `7f95c3e1d37603d5ac294657a19918bfbabd1a9f`. CI and Gate B on the new head are for the host publisher; not claimed here.

## Changes

1. **Row logos** — `logoUrlForPlace` again uses `resolveThingLogoUrl` (same chain as staging TREK / `shared-trip-live-tab-lists.mjs` list rows) plus explicit source favicon fields. Commit ac2bc4ec had dropped runtime resolution, so rows with only website-derived logos rendered with `data-has-logo="0"`.
2. **Stores tab** — Deduplicate store rows by normalized name (keep the lower-priced duplicate). Default sort for stores is **price** ascending (cheapest-first), matching flights/hotels/cars.

Files: `apps/vacation-client/src/lib/listTabModel.mjs`, `apps/vacation-client/src/screens/CategoryTabScreen.tsx`, `apps/vacation-client/test/listRows.unit.mjs`.

## Checks (local)

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)

## Left alone (scope)

- List long-description vs itinerary summary behavior (16:03 PT ruling) — unchanged.
- Checker, fixtures, baselines, `vercel.json`, dependencies — not touched.
- No merge/rebase/push from this lane.
