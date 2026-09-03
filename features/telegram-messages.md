# Telegram-style messages

Telegram-style messages let an authorized owner or paid collaborator edit an existing itinerary with one clear text request that goes through the shared `vacation-edit-pipeline`.

## Sub-features

- `telegram-text-move` moves a named Thing to a stated day.
- `telegram-text-remove` removes a named Thing and names the old location.
- `telegram-text-no-match` returns the exact no-match sentence.
- `telegram-text-alias` normalizes aliases such as `Omeker's` to `Umekes Fish Market Bar & Grill`.
- `telegram-text-research-reject` refuses live-music / look-up requests without writing.

## How to get to it (user POV)

- Send a text message to the TimeSyncher Vacation Telegram bot from the linked owner chat.
- Send the same text as a paid Telegram collaborator.
- Replay the request through `control-vacation dry-run` using a fixture.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Fixture trip `trip-vegas-live-001` is locked.

- **Single clear edit.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/telegram-text-single-edit.json --json`. `planned_writes[0].op` is `move_thing` and the reply starts with `Moved Bellagio Fountains`.
- **Local snapshot (not product state).** Run `node scripts/control-vacation.mjs apply --local-snapshot --fixture features/fixtures/telegram-text-single-edit.json --json`. Mode is `apply_local_snapshot`. `prove_state_movement` is `hold`. The JSON hash is not TREK/product state.
- **TREK id-set movement.** Run `node scripts/test_vacation_edit_pipeline.mjs` (the `trek_sqlite` Bellagio unit test) and `node scripts/test_vacation_trek_apply.mjs`. Bellagio moves day 1 → day 2. `row_ids` stay `["41"]` and row count stays `1`. Do not claim uniqueness from fixture sqlite without those tests.
- **Bare apply refused.** `node scripts/control-vacation.mjs apply --fixture features/fixtures/telegram-text-single-edit.json` exits `2` and asks for `--local-snapshot` or `--trek-db`.
- **Exact no-match.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/exact-no-match.json --json`. `customer_facing_response` is `I heard "Remove the volcano helicopter tour", couldn't find a match, what do you mean?`
- **Alias.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/alias-omeke.json --json`. The planned write title is `Umekes Fish Market Bar & Grill`.
- **Success wording.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/successful-edit-wording.json --json`. The reply names the removed item and location and does not mention a first pass.
- **Split-trip TREK uniqueness.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/split-trip-trek-uniqueness.json --json`. `trek_state.row_ids_before` equals `row_ids_after` (`["41"]`) and `row_count_*` stays `1`. Do not use a UI hash as uniqueness proof.
- **Proof.** Keep `artifacts/vacation-verify/vac-verify-telegram-text-single-edit/{events.jsonl,dry-run.json,before.json,after.json}`.

## Gotchas

- Telegram text, Telegram voice, and shared-page voice must use this same matcher order.
- Support questions ("Can you send me the link?") are no-write and must not enter the writer.
- A reply that says the itinerary was updated without TREK id-set movement is a failure. A local fixture hash is not enough.
- Live Telegram intake (`api/vacation-telegram-turn.mjs`, `scripts/telegram-vacation-intake-bot.mjs`, `scripts/product-gbrain-dispatch.mjs`) calls `gateTelegramIntakeEdit`. Empty Thing list, unmatched edits, skip, and integrity stops fail closed with `editApplied: false` and never call `applyTrekItineraryEdit`. `pipelineWriteDecision.allowTrekWrite` is the only path to a TREK writer. After that gate, `applyTrekItineraryEdit` and the FORCE/agent path apply pipeline `planned_writes` only (`applyValidatedOnly`); they must not re-parse `requestText`. The Thing list is live-locked `trip_things` for that `trip_id`, not client `payload.things`. The bot assigns `payload.liveSession` from `resolve_live_session` so unauthorized blocking is not inert.
- Shared-page intake is `POST` `vacation_edit` on `api/vacation-itinerary.mjs` (`webAccess=1`). Logged-out and public-link actors fail closed.
- Do not ask the customer to paste the shared URL when the session already has a locked `trip_id`.
