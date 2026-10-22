Closes #607

Host merged `migrate/trek-source` at `fb95a6306b16ea71cfc1adc6fc76a5779ec47403` into PR head `a907df5df0f4da54d5f00337e8bab8e08f2eb7a9` (2026-10-22 cursor-ubuntu vkfill-610 base-merge round).

## Problem

- Hotel list rows: when stored summary is only `Neighborhood: …;` (or other thin neighborhood/rating stub), derive the visible line from `longDetails` / long copy so each hotel gets a distinct, substantive description (#607).
- Unit tests cover UWS stub summaries and updated midtown long-copy pick expectations.

## Fix

- `node apps/vacation-client/test/listRows.unit.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass
- Offline replay: `gate-b-nyc-shared-staging.json` — 0 duplicate hotel list descriptions (was multiple groups sharing `neighborhood: upper west side`)

**Not run locally:** Gate B pixel compare, live `live_accept.py`. Full `offline-tests.txt` loop may stop at `test_live_transcript_dialog_pdf.mjs` on hosts with GBrain CLI installed.

- Flight/budget price Gate B lines (non-blocking per handoff), baselines, capture config, workflows, dependencies.
- CI + Gate B on pushed head are authority for done.
