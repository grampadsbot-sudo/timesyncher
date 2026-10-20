# VK #562 close verdict (cursor-ubuntu vkfill-562-202610200738)

## Outcome

**Already satisfied on `migrate/trek-source` at lane start** (`998235cecb967b07d798f314ca072690b1942e11`). Harness parity reference is bound to the candidate Timeline selection via merged PR **#565**; this lane verified the regression offline and filed a close verdict instead of an empty duplicate PR.

## Root cause (summary)

Pre-#565, Gate B feature parity could compare candidate captures (explicit `thingOverrides.place:{id}.timeline` selections) against a staging reference capture that still structurally required unchecked hotel stay rows (e.g. Hotel Beacon / `place:25`). Product timeline build was correct; the harness producer/cache path was not selection-bound.

## Landed repair (on base before lane edits)

| Commit | Change |
|--------|--------|
| `47c1c9613e819ecd5db87bebb10de828b0abcc75` | `prepareTimelineReplay` (`scripts/ops/capture/timeline-replay.mjs`), capture manifest binding, `staging_capture` cache key `-timeline-explicit-v1`, `test_same_selection_capture` regression |
| `3664c453` / `0cecf594` | Capture day traversal and portable evidence (same #562 thread) |
| `d38e507e786398c07ac91e89dc22c8e8aa5ebd04` | Merge PR #565 into `migrate/trek-source` |

## Acceptance (offline, this lane)

- `node scripts/test_same_selection_capture.mjs` — **PASS** (9 unit tests; hotel stay-row oracle; reference-cache binding; saved-artifact replay)
- `node scripts/check-no-comments.mjs` — **PASS**
- `node scripts/test_offline_manifest.mjs` — **PASS**
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — **PASS** (0 fail)

## Managing-dr action

Close GitHub issue **#562** with reason: fixed on `migrate/trek-source` by PR #565 (`d38e507e786398c07ac91e89dc22c8e8aa5ebd04`); regression `scripts/test_same_selection_capture.mjs`. Unblocks prerequisite for #543 (product parity still separate).

## Left alone

Baselines, Gate B/capture thresholds, workflows, NYC fixture text, Priceline logo source failure, app UI (#543).

## Job artifacts

Lineage diagnosis: `vkfill-562-202610200738-job/vkfill-562-diagnosis.md`.
