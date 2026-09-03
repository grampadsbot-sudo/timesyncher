# Voice notes

Voice notes let a user speak an itinerary change on Telegram or a shared page. The original audio path and transcript stay with the job, and every split intent is validated on its own.

## Sub-features

- `voice-telegram-single` transcribes one Telegram voice note and edits one matched Thing.
- `voice-telegram-multi` splits several requests in one note and applies only validated writes.
- `voice-shared-day` uses day-timeline context from a shared-page microphone.
- `voice-shared-list` passes every visible list item as parser context.
- `voice-incomplete-move` refuses a move that names no destination.

## How to get to it (user POV)

- Hold the Telegram microphone and send a voice note to the Vacation bot.
- Use the shared-page microphone on a day timeline.
- Use the shared-page microphone on a list of Things.
- Replay a stored transcript plus `features/fixtures/audio/kim-vegas-voice.ogg` through `control-vacation`.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- `features/fixtures/audio/kim-vegas-voice.ogg` exists as the fixture audio path.

- **Telegram multi-intent.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/telegram-voice-multi-intent.json --json`. Intents are `remove`, `move`, and `research`. Two writes are planned. The live-music request no-ops as `unsupported_research`.
- **Audio preserved.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/telegram-voice-audio.json --json`. `audio_path` ends with `kim-vegas-voice.ogg` and the file exists.
- **Shared-page day.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/shared-page-voice-day.json --json`. `page_context.kind` is `day` and In-N-Out is removed from day 2.
- **Shared-page list.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/shared-page-voice-list.json --json`. `page_context.item_ids` includes `thing-topgolf` plus the other visible items.
- **Incomplete move.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/incomplete-move.json --json`. No write is planned.
- **Proof.** Keep the audio path, transcript, `before.json`, `after.json`, and `events.jsonl` for the job.

## Gotchas

- A list-page microphone that only feeds the current day is a contract failure.
- The parser may split and propose aliases. It must not write.
- Whisper/STT is outside this dry-run. The fixture supplies the transcript and the audio path.
- Multi-intent voice is not all-or-nothing: validated edits apply, unsupported clauses no-op.
