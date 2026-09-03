# Timeline / Thing media

Timeline and Thing media let an authorized user attach a photo or video to a day or a specific Thing on the locked trip so the shared timeline and keepsake can show it.

## Sub-features

- `thing-media-bind` attaches media to a validated `thing_id` on the live trip.
- `day-media-bind` attaches media to a day on the locked trip.
- `thing-media-stale` rejects media whose Thing belongs to another `trip_id`.
- `thing-media-visible` requires the Thing to be in the page context that the microphone or text used.

## How to get to it (user POV)

- Open the shared day timeline and attach a photo to a Thing.
- Open the shared list of Things and attach media to one visible row.
- Send a Telegram photo with a caption that names the Thing.
- Replay list-page and stale-media fixtures.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Page context lists the Thing IDs the user can see.

- **List context.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/shared-page-voice-list.json --json`. `page_context.item_ids` contains every visible Thing, including the target.
- **Day context.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/shared-page-voice-day.json --json`. Only day 2 items are in context.
- **Stale bind.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/stale-trip-media.json --json`. No attach write is planned.
- **Proof.** Artifact `dry-run.json` shows `page_context.item_ids` and any `attach_media` write with the locked `trip_id`.

## Gotchas

- A day microphone must not silently widen to the whole trip. A list microphone must not shrink to one day.
- Maps, unassigned/options, and the shared page must lose a removed Thing. This lever records the itinerary snapshot; TREK pin cleanup is a later apply-time check.
- Do not attach media to a suggested/research queue item unless the fixture marks it as a real Thing on the live trip.
