# VK PR #549 receipt (cursor-ubuntu, dr-sanctioned description round 2026-10-21)

## Outcome

List-row description substance (#546): ccab merge at display time, no pipeline diagnostic text on Hotels/Events/Cars list rows; car rows include stored longDetails; timing-only event shells fall back to sourced narrative; row 608 uses `hotelListRowUnboundNarrative` instead of blocked ccab copy.

## Changes

- `listTabModel.mjs`, `list-row-description.mjs`, `trip-thing-enrichment.mjs`, `pr336-vk-search-trip-sources.mjs` (see PR description).

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

Tip sha: _(filled after commit)_.

Pre-merge Gate B: not run (cron); targets generic descriptions / `description substance and quality` on head per handoff `bot-admin/lanes/vk-pr-handoff/pr-549`.
