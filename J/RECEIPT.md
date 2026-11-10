# PR #913 / vkfill-905 port — CI `unit-tests` fix (HOST PUBLICATION ONLY)

**Starting HEAD:** `e18a08efa3df43c116adb0ca58917c46a4759a18` (verified before edit)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-913` — page_not_found on this pass (per lane brief).

## This round change

| File | Why |
|------|-----|
| `vacation-app.html` | Host replay of #909 routed chat send failures through `handleChatSendFailure` in `public/vacation-app-request.js` only. `scripts/test_reply_action_claim_d2_paia_save_route.mjs` still requires the literal `showComposerStatus(customerSafeErrorMessage` call in `vacation-app.html`. Inlined the same catch logic (90s `AbortError` bubble + composer status) so static contract and runtime behavior match. |

## Turn-2 hang (inherited from #909 port on this branch; documented for host demo)

**Root cause (staging run A, copy trip 199):** Turn 1 without an explicit day returned `day_not_found` / “Day ?” because Carbone spans inference failed; turn 2 then waited on the queued reply path without a customer-visible terminal state within 420s.

**Fix already on branch (not re-authored this round):** `resolveItineraryEditDayNumber` / `dayNumbersForPlace` infer day when the place sits on exactly one day; `prepareChatItineraryEditForQueueTurn` logs and returns explicit `edit_failed` on overrides PUT failures (e.g. 413 — covered in `scripts/test_chat_itinerary_edit.mjs`); client `CHAT_SEND_TIMEOUT_MS` 90s with “That took too long — please try again.”

## Fix-6 Zinc logo (inherited from #909 port)

**Finding:** `apps/vacation-client/src/lib/logoChipHandlers.mjs` `onLogoImgLoad` accepts a loaded `.ico` when `naturalWidth/Height >= 1` instead of treating small favicons as broken and falling through to emoji. Gray chevron on the live copy was a failed-logo fallback path, not the standard category default; host should confirm Zinc Bar (place 8967) on a fresh copy after deploy.

## Decision trail

1. CI failure is the static HTML regex in `test_reply_action_claim_d2_paia_save_route.mjs`, not queue/reply logic — queue half of that test already passed locally.
2. Re-inline catch in `vacation-app.html` rather than loosening the test (banned).
3. Keep `handleChatSendFailure` on `tsVacationAppRequest` for API symmetry; only `vacation-app.html` uses the inlined path.

## Checks run @ `e18a08ef` + local patch

| Command | Result |
|---------|--------|
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | pass |
| `node scripts/test_vacation_app_client_errors.mjs` | pass |
| `node scripts/test_chat_itinerary_edit_905.mjs` | pass |
| `node scripts/test_chat_itinerary_edit.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (after `apps/vacation-client/npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |

## Host next steps

Commit/push `vacation-app.html` only on `vkfill/905-port-20261110012849`. Re-run full CI + Gate B on host build.

**Uncommitted diff:** `vacation-app.html` (+9 −1)
