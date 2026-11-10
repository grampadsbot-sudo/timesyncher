# Issue #859 — chat itinerary edit (assignment move + post-gen timeout)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1`. **Lane:** cursor-ubuntu, composer-2.5.

## Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote `thingOverrides` + `perDaySchedule` only; no TREK assignment move. `buildDayTimeline` lists Thing rows from `assignments[dayId]` only, so UI stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Post-generation `rewriteBlockedActionClaim` and `blockVacationAppReplyIdCitation` had no wall-clock bound; slow paths could hit the 60s Vercel limit after Haiku returned.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as “on day,” masking missing assignments.

## Fix (product)

| Path | Change |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Ensure assignment on target day via TREK before schedule overrides; `placeOnDay` = assignment-only; honest `applied:false` when move fails |
| `src/vacation/chat-itinerary-edit-assignment.mjs` | Assignment find/move/create on in-memory payload + plan helpers |
| `src/vacation/chat-itinerary-edit-trek-write.mjs` | Guarded TREK writes: shared overrides PUT, assignment move PUT, day assignment POST |
| `src/vacation/chat-itinerary-edit-slug-guard.mjs` | Allowlist / demo-lock guard (split for ratchet) |
| `src/vacation/chat-itinerary-edit-day.mjs` | `assignedDayNumbersForPlace`; day resolve uses assignments for set_time / add_bar_before |
| `src/vacation/bounded-await.mjs` | `boundedAwait` + `chatReplyPostgenTimeoutMs` (default 12s) |
| `src/vacation/vacation-app-chat-postgen.mjs` | Bounded rewrite + reply ship gate factories |
| `routes/vacation-app-chat-queue.mjs` | Wire bounded post-gen steps |
| `scripts/test_chat_itinerary_edit.mjs` | Assignment mocks, guard scan targets trek-write module |
| `scripts/test_chat_itinerary_edit_905.mjs` | Copy-shape two-turn Carbone Day1→Day2 @20:30 + Zinc before Carbone; 413 + huge-overrides + queue postgen wiring checks |

## New cases vs vk@ed8687b

On start HEAD `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1`, `scripts/test_chat_itinerary_edit_905.mjs` copy-shape turn 1/2 and timeline assertions **fail** (Carbone stays on Day 1 assignment-only timeline).

## Checks (this workspace, uncommitted tree)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
# test_chat_itinerary_edit: ok

node scripts/test_chat_itinerary_edit_905.mjs
# chat_itinerary_edit_failed trek_edit_write_failed 413 ... (expected oversize probe)
# test_chat_itinerary_edit_905: ok

cd apps/vacation-client && timeout 900 npm test
# vacation-client tests finished

node scripts/check-no-comments.mjs
# no-comment check passed (1143 files scanned)

node scripts/test_offline_manifest.mjs
# offline manifest ok (442 offline, 19 online)

BASE=vk node scripts/check-code-ratchet.mjs
# code ratchet check passed (252 report, 0 fail)
```

Not run here: live two-turn proof (`~/tsv-dispatch/lanes/jobs/chat-edit-live-proof-859-next/`), Gate B, CI, deploy.

## Host publish

Stage all under:

- `routes/vacation-app-chat-queue.mjs`
- `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs`
- `src/vacation/bounded-await.mjs`
- `src/vacation/chat-itinerary-edit*.mjs` (edit, assignment, day, slug-guard, trek-write)
- `src/vacation/vacation-app-chat-postgen.mjs`

Do **not** include accidental evidence PNGs (reverted).

Single commit + push + PR into `vk` with `Closes #859`; use `J/PR_DESCRIPTION.md`.
