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
- **Prove movement.** Run `node scripts/control-vacation.mjs apply --fixture features/fixtures/telegram-text-single-edit.json --json`. `before_hash` and `after_hash` differ. The Bellagio item `day` becomes `2`.
- **Exact no-match.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/exact-no-match.json --json`. `customer_facing_response` is `I heard "Remove the volcano helicopter tour", couldn't find a match, what do you mean?`
- **Alias.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/alias-omeke.json --json`. The planned write title is `Umekes Fish Market Bar & Grill`.
- **Success wording.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/successful-edit-wording.json --json`. The reply names the removed item and location and does not mention a first pass.
- **Proof.** Keep `artifacts/vacation-verify/vac-verify-telegram-text-single-edit/{events.jsonl,dry-run.json,before.json,after.json}`.

## Gotchas

- Telegram text, Telegram voice, and shared-page voice must use this same matcher order.
- Support questions ("Can you send me the link?") are no-write and must not enter the writer.
- A reply that says the itinerary was updated without a hash change is a failure.
- Do not ask the customer to paste the shared URL when the session already has a locked `trip_id`.
