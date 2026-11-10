# PR #940 — #859 chat edit + vk base merge (#945 NYC unlock)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `cc656a381458bdd6ae740c2eb2b94ea4b4c8278a` (verified). **Host base-merge:** `origin/vk` (`7d17944a68b48cebb8236692659d9c488da975bc`) into PR head. **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Conflict resolution (2026-11-10 UTC)

| Path | Resolution |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | HEAD: modular slug-guard + trek-write imports; dropped vk duplicate inline `loadChatItineraryEditConfig` / guard / `trekPublicBase`. |
| `src/vacation/chat-itinerary-edit-slug-guard.mjs` | vk #949: guard uses `demo_locked` config only (removed hard lock on NYC slug); NYC in allowlist per merged config. |
| `scripts/test_chat_itinerary_edit_905.mjs` | PR copy-shape two-turn + bounded post-gen + vk demo-locked fixture slug + route asserts. |
| `config/chat-itinerary-edit-trips.json` | Staged from merge: NYC allowlisted, `chat-edit-demo-locked-fixture` in `demo_locked`. |
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

## Vk carry — demo-locked chat (#945 / #949)

Craig: unlock NYC demo trip chat edits; keep `chat-edit-demo-locked-fixture` for lock-path tests only.

- `prepareChatItineraryEditForQueueTurn` sets `itineraryEditCannedReply` on `demo_locked` and leaves `itineraryEditAuthoritative` empty.
- Queue short-circuits: if `itineraryEditCannedReply` is set, `producedDemoLockedChatEditReply` and skip `produceLiveAppReply`.

**Untouched:** trip 99 itinerary DB/JSON, demo chat history, baselines, deploy/CI config, dependencies.

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

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/RECEIPT.md` | Conflict resolved |
| `src/vacation/chat-itinerary-edit.mjs` | Conflict resolved |
| `src/vacation/chat-itinerary-edit-slug-guard.mjs` | NYC guard: `demo_locked` config only (#949) |
| `scripts/test_chat_itinerary_edit_905.mjs` | Conflict resolved |
| Merge already staged: `config/chat-itinerary-edit-trips.json`, `scripts/test_chat_itinerary_edit.mjs` |

**Host:** `git add` conflict resolutions, `git commit --no-edit` for merge; push once to `vkfill/859-20261110023051`. Rebake served bundle if `public/assets/` was taken from vk.

## Left alone (scope)

- Baselines, Gate B, workflows, deploy config, `package.json` / lock.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).

Not run here: Gate B, live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-2026111000331/watch940.py`).
