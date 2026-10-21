# VK PR #549 receipt (cursor-ubuntu, dr-sanctioned description round 2026-10-21)

## Outcome

List-row layout + description fallback for Gate B (#546): descriptions stay on the name line at 390 and 1280 on flights/cars/hotels; list UI uses stored long narrative when composed copy is generic/short (Smoke Jazz / ccab-backed events).

## Changes

- `apps/vacation-client/src/styles.css`: single-line grid for flight (6 columns), car (logo/name/price/desc), and narrow viewports; removed stacked desc rows that failed `row_layout` at 1280.
- `apps/vacation-client/src/lib/listTabModel.mjs`: pass `longDetails` into compose; fall back to non-generic stored narrative when composed list text is under 6 words or template-generic.

## Checks (local tip after commit)

| Command | Exit |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | 0 |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `cd apps/vacation-client && npm run typecheck` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

Tip sha: `114a7cad`.

Pre-merge Gate B: not run (cron); prior head `180b6a448af5434d060d51ef1cabe33f33e09d38` had Smoke Jazz generic + row layout fails per handoff `bot-admin/lanes/vk-pr-handoff/pr-549`.
