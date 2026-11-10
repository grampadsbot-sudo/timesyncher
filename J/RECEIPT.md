# TSV #945 — Deterministic locked-trip chat reply (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH. **Lane start HEAD:** `5a0d72e5a607fa4234bf687a956bb34e96cd10e2`. **Merged onto:** `origin/vk` `8646e9e2` (PR #946 / #944 max-content time column, after #896). **Lane:** cursor-ubuntu. **Authority:** eggbot 5:59 AM PT 11/10 (`eggbot:lock-template-20261110-0600`).

## Product fix

Locked-trip chat edits use a fixed customer template and do not call the model:

> This demo trip is locked for chat edits. You can change it on the trip site.

- `src/vacation/chat-itinerary-edit-day.mjs` exports `DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY` and `producedDemoLockedChatEditReply`.
- `prepareChatItineraryEditForQueueTurn` sets `itineraryEditCannedReply` on `demo_locked` and leaves `itineraryEditAuthoritative` empty.
- `routes/vacation-app-chat-queue.mjs` short-circuits: if `itineraryEditCannedReply` is set, return the canned reply and do not call `produceLiveAppReply`.

**Unchanged:** NYC lock / allowlist / trip 99 data. Proofs only on a throwaway locked copy, never Craig's NYC demo session.

## Merge note

Receipt-only conflict vs `origin/vk` `8646e9e2` (PR #946) resolved by keeping this #945 receipt. No product overlap with #944/#946.

## Checks

`test_chat_itinerary_edit.mjs` and `test_chat_itinerary_edit_905.mjs` PASS on the prior merge onto `6017b330`.
