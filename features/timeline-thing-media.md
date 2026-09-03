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
- **Cross-trip Thing.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/thing-media-stale.json --json`. `planned_writes` is `[]`. `no_ops[0].reason` is `thing_id_cross_trip`. The `thing_id` belongs to another `trip_id`. Bound-trip `stale_trip_media` is a different stop.
- **Not visible on this page.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/thing-media-visible.json --json`. `planned_writes` is `[]`. `no_ops[0].reason` is `thing_not_visible`. Bellagio is on the locked trip but not in the day-2 page context.
- **Proof.** Committed trees: `features/proof/vac-verify-thing-media-stale/` and `features/proof/vac-verify-thing-media-visible/` (`receipt.json`, `events.jsonl`, `dry-run.json`). Refresh with `node scripts/control-vacation.mjs commit-proof`. `fail_closed_thing_id` must say write=null.

## Gotchas

- A day microphone must not silently widen to the whole trip. A list microphone must not shrink to one day.
- Maps, unassigned/options, and the shared page must lose a removed Thing. This lever records the itinerary snapshot; TREK pin cleanup is a later apply-time check.
- Do not attach media to a suggested/research queue item unless the fixture marks it as a real Thing on the live trip.
- Thing-scoped attach fail-closes when `thing_id` belongs to another trip (`thing_id_cross_trip`) or is missing from the page context (`thing_not_visible`). Bound-trip stale (`stale_trip_media`) is not a thing_id stop. Do not treat a matching `bound_trip_id` as enough.
