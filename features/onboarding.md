# Onboarding

Onboarding takes a paid customer from checkout success to a linked Telegram session, EULA acceptance, and the first trip-summary voice note or text.

## Sub-features

- `onboarding-order-success` shows the post-purchase session and Telegram start link.
- `onboarding-eula` requires EULA accept at `/accept/vacation-<token>` before Telegram work starts.
- `onboarding-telegram-start` links `/start <token>` to the onboarding session and trip.
- `onboarding-voice-intro` teaches the Telegram microphone before the first trip summary.
- `onboarding-identity` captures vacation name and unforgettable goal before a first-pass itinerary.

## How to get to it (user POV)

- Land on `/order-success.html?session=<token>` after Stripe or coupon checkout.
- Open the EULA accept URL from email or Telegram.
- Tap `https://t.me/TimeSyncherVacationBot?start=<token>` (or the staging bot).
- Send the first voice note or text summary after the microphone intro.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Do not start a live Telegram bot poller or customer journey.

- **Session link shape.** Read `src/vacation/onboarding.mjs` helpers via existing tests. Run `node scripts/test_vacation_telegram_intake.mjs`. Exit code `0`. Identity ack still uses first-pass language only for new intake, not later edits.
- **EULA gate.** Run `npm run test:eula`. Exit code `0`. Telegram work stays blocked until accept.
- **Voice intro is not an edit.** The microphone practice step is onboarding, not `vacation-edit-pipeline`. Do not feed it to `--apply`.
- **Proof.** Record that this feature was reached through order-success → EULA → Telegram `/start`, and that the edit pipeline was not used to invent a first-pass itinerary.

## Gotchas

- First-pass copy such as "turning that into the hosted TimeSyncher Vacation itinerary now" is valid only during onboarding intake.
- Using that copy on an existing trip edit is a verification failure. See [Telegram-style messages](./telegram-messages.md).
- Staging and production bots have different usernames. Assert the env-selected username, not a hard-coded production handle.
- `/start` without a paid session must not create a TREK row.
