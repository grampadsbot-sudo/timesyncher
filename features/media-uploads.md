# Media uploads

Media uploads attach a photo or short video to the live vacation only when the actor is authorized and the file is bound to the locked `trip_id`.

## Sub-features

- `media-live-trip` accepts media whose `bound_trip_id` matches the locked live trip.
- `media-stale-trip` rejects media bound to a different or stale trip.
- `media-unauthorized` rejects public-link and unpaid collaborator uploads.
- `media-entitlement` requires photo or video memories flags on the synthetic account.

## How to get to it (user POV)

- Send a photo or video to the Vacation Telegram bot from a linked owner or paid collaborator chat.
- Use owner-media checkout, then upload from Telegram.
- Attempt an upload from a public shared-page link (must fail).
- Replay `stale-trip-media` and `unauthorized-upload` fixtures.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Locked trip is `trip-vegas-live-001` with `status: live`.

- **Stale trip fail-closed.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/stale-trip-media.json --json`. `planned_writes` is `[]`. `no_ops[0].reason` is `stale_trip_media`.
- **Unauthorized fail-closed.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload.json --json`. `no_ops[0].reason` is `unauthorized_upload`.
- **Entitlement missing.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/checkout-entitlements-missing.json --json`. Photo/video access stays closed.
- **Proof.** `events.jsonl` records `lock_identity` with the live `trip_id` before any media decision.

## Gotchas

- Telegram file bytes are not fetched in this dry-run. The lever proves binding and authorization, not storage I/O.
- A caption that names the Vegas trip does not override a stale `bound_trip_id`.
- Staging bypass env (`TIMESYNCHER_MEDIA_UPLOAD_STAGING_BYPASS`) must stay unset for fail-closed proof.
- Thing-scoped attachments are covered in [Timeline / Thing media](./timeline-thing-media.md).
