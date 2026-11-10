# TSV #941 — hide unsupported mic at rest; honest NYC lock reply (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Lane start HEAD:** `52d88438fefbb108ea67795faeeb08904b77f65c`. **Lane:** cursor-ubuntu. **Authority:** eggbot 4:11 AM PT 11/10 (`eggbot:mic-lock-20261110-0412`).

## Changes

| Path | Change |
| --- | --- |
| `public/vacation-app-request.js` | `bindVoice`: when `SpeechRecognition` / `webkitSpeechRecognition` is missing, hide `#voiceButton` (`hidden`) instead of disabling and showing unsupported error at rest. Post-tap unsupported copy unchanged. |
| `src/vacation/chat-itinerary-edit-day.mjs` | Add `buildItineraryEditDemoLockedAuthoritativeSystemExtra()` — short honest lock refusal; forbid invented itinerary facts. |
| `src/vacation/chat-itinerary-edit.mjs` | `demo_locked` skip: empty `replyContext`; `prepareChatItineraryEditForQueueTurn` sets `itineraryEditAuthoritative` so queue uses plain customer turn (no appended model instructions). |
| `scripts/test_issue_870_composer_mic.mjs` | Assert mic hidden + empty status without constructors; assert unsupported message only after mic tap when `getUserMedia` missing. |
| `scripts/test_chat_itinerary_edit.mjs` | Assert empty lock `replyContext`, authoritative lock wording, invented refusal phrases absent; lock guard unchanged. |

**Out of scope (unchanged):** NYC unlock, trip 99 data, UA sniffing, `config/chat-itinerary-edit-trips.json`, Gate B/baselines, git metadata.

## Checks

| Command | Result |
| --- | --- |
| `node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | FAIL — `apps/vacation-client/node_modules/typescript` missing in worktree; host re-run after full deps install |

## Host publish

Uncommitted diff (5 files): `public/vacation-app-request.js`, `src/vacation/chat-itinerary-edit-day.mjs`, `src/vacation/chat-itinerary-edit.mjs`, `scripts/test_issue_870_composer_mic.mjs`, `scripts/test_chat_itinerary_edit.mjs`. Branch `vkfill/941-20261110041423`, one push, PR into `vk` with `Closes #941`. Ref: start HEAD `52d88438`.
