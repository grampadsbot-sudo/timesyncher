# TSV #945 — deterministic `demo_locked` chat reply (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Lane start HEAD:** `5a0d72e5a607fa4234bf687a956bb34e96cd10e2`. **Lane:** cursor-ubuntu. **Authority:** eggbot 6:00 AM PT 11/10 (`eggbot:lock-template-20261110-0600`).

## Changes

| Path | Change |
| --- | --- |
| `src/vacation/chat-itinerary-edit-day.mjs` | `DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY` (verbatim two-sentence template); `producedDemoLockedChatEditReply()` for queue short-circuit (`jevRan: false`). Removed model-directed `buildItineraryEditDemoLockedAuthoritativeSystemExtra`. |
| `src/vacation/chat-itinerary-edit.mjs` | `prepareChatItineraryEditForQueueTurn` sets `itineraryEditCannedReply` on `demo_locked`; no `itineraryEditAuthoritative` on lock path. |
| `routes/vacation-app-chat-queue.mjs` | When `itineraryEditCannedReply` is set, ship canned reply without calling `produceLiveAppReply`. |
| `scripts/test_chat_itinerary_edit.mjs` | Assert exact lock template from `prepareChatItineraryEditForQueueTurn`. |
| `scripts/test_chat_itinerary_edit_905.mjs` | Lock-path template, no model completion (`jevRan: false`), queue short-circuit wiring, invented phrases absent. |

**Out of scope (unchanged):** NYC unlock, `demo_locked` config, trip 99 data, Gate B/baselines, git metadata.

## Checks

| Command | Result |
| --- | --- |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | FAIL — `apps/vacation-client/node_modules/typescript` missing in worktree; host re-run after full deps install |

## Host publish

Uncommitted diff (5 files): `src/vacation/chat-itinerary-edit-day.mjs`, `src/vacation/chat-itinerary-edit.mjs`, `routes/vacation-app-chat-queue.mjs`, `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs`. Branch from `vk` at `5a0d72e5`, one push, PR into `vk` with `Closes #945`. Ref: start HEAD `5a0d72e5`.
