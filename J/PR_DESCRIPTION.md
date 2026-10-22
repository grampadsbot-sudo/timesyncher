Closes #607

## Summary

- Hotel list rows: when stored summary is only `Neighborhood: …;` (or other thin neighborhood/rating stub), derive the visible line from `longDetails` / long copy so each hotel gets a distinct, substantive description (#607).
- Unit tests cover UWS stub summaries and updated midtown long-copy pick expectations.

## Checks (local)

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass
- Offline replay: `gate-b-nyc-shared-staging.json` — 0 duplicate hotel list descriptions (was multiple groups sharing `neighborhood: upper west side`)

## Left alone (scope)

- Flight/budget price Gate B lines (non-blocking per handoff), baselines, capture config, workflows, dependencies.
- CI + Gate B on pushed head are authority for done.
