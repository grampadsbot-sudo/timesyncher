# PR #940 — #859 chat edit + vk base merge

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `c20beedc562dfb9588c5d45744a38867c16086c0` (verified). **Host base-merge:** `origin/vk` into `c20beedc`. **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Conflict resolution (2026-11-10 UTC)

| Path | Resolution |
| --- | --- |
| `routes/vacation-app-chat-queue.mjs` | Both: `producedDemoLockedChatEditReply` canned path (vk #945) + `createBoundedRewriteClaim` / `createBoundedReplyShipGate` (#859). |
| `scripts/test_chat_itinerary_edit.mjs` | vk demo-locked canned reply + 413 oversize cases; PR assignment-move cases unchanged. |
| `scripts/test_chat_itinerary_edit_905.mjs` | PR copy-shape two-turn + bounded post-gen wiring + vk demo-locked route asserts. |
| `J/RECEIPT.md` | This file. |

## Issue #859 — chat itinerary edit

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product)

| Path | Change |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Assignment ensure before schedule; assignment-only on-day |
| `src/vacation/chat-itinerary-edit-day.mjs` | Assignment-based day resolve; demo-locked canned reply |
| `src/vacation/bounded-await.mjs` | Bounded `boundedAwait` |
| `src/vacation/vacation-app-chat-postgen.mjs` | Bounded rewrite + ship gate |
| `routes/vacation-app-chat-queue.mjs` | Wire bounded post-gen + demo-locked short-circuit |

Copy-shape turn 1/2 in `_905.mjs` **fail** on vk tip before assignment/bounded-postgen patch.

## Vk carry — demo-locked chat (#945)

Locked-trip chat edits use a fixed customer template and do not call the model:

> This demo trip is locked for chat edits. You can change it on the trip site.

- `prepareChatItineraryEditForQueueTurn` sets `itineraryEditCannedReply` on `demo_locked` and leaves `itineraryEditAuthoritative` empty.
- Queue short-circuits: if `itineraryEditCannedReply` is set, `producedDemoLockedChatEditReply` and skip `produceLiveAppReply`.

**Unchanged:** NYC lock / allowlist / trip 99 data.

## Checks (conflict-resolution tree)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

| Command | Result |
| --- | --- |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | ok |
| `node scripts/test_chat_itinerary_edit_905.mjs` | ok |
| `node scripts/check-no-comments.mjs` | ok (1151 files) |
| `node scripts/test_offline_manifest.mjs` | ok (447 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | ok (251 report, 0 fail) |

Merge note: vk 413 oversize + bulk put cases live in `_905.mjs` only (ratchet FILE-SIZE-500); demo-locked canned reply in `.mjs`. `producedDemoLockedChatEditReply` imported from `chat-itinerary-edit-day.mjs` in queue + `_905`.

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/RECEIPT.md` | Conflict resolved |
| `routes/vacation-app-chat-queue.mjs` | Merged imports + both behaviors |
| `scripts/test_chat_itinerary_edit.mjs`, `_905.mjs` | Tests from both sides |
| `src/vacation/chat-itinerary-edit.mjs`, `chat-itinerary-edit-day.mjs` | Staged merge tree |

**Host:** `git add` conflict resolutions, `git commit --no-edit` for merge; push once to `vkfill/859-20261110023051`. Rebake served bundle if `public/assets/` was taken from vk.

## Left alone (scope)

- Baselines, Gate B, workflows, deploy config, `package.json` / lock.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).

Not run here: Gate B, live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`).
