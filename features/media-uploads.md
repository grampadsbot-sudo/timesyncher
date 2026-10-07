# Media uploads

Media uploads attach a photo or short video to the live vacation only when the actor is authorized and the file is bound to the locked `trip_id`.

## Sub-features

- `media-live-trip` accepts media whose `bound_trip_id` matches the locked live trip.
- `media-stale-trip` rejects media bound to a different or stale trip.
- `media-unauthorized` rejects public-link, logged-out, and unpaid collaborator uploads from a second, non-owner identity. One authenticated owner actor is not proof.
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
- **Owner upload control.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/authorized-owner-upload.json --json`. Actor identity is `owner-craig` and `planned_writes[0].op` is `attach_media`.
- **Public-link reject.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload.json --json`. Actor identity is `public-link-visitor` (not the owner). `no_ops[0].reason` is `unauthorized_upload`.
- **Logged-out reject.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload-logged-out.json --json`. Actor identity is `logged-out-visitor`. Same media payload, no write.
- **Unpaid collaborator reject.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload-unpaid-collaborator.json --json`. Actor identity is `collaborator-kim-unpaid`. Same media payload, no write.
- **Entitlement missing.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/checkout-entitlements-missing.json --json`. Photo/video access stays closed.
- **Proof.** `events.jsonl` records `lock_identity` with the live `trip_id` before any media decision.

## Gotchas

- JSON role flags are not live-session proof. `actorFromLiveSession` maps a real session onto the same unauthorized branch. `customer_id` alone is not owner/`canEdit`. `staging_bypass` (env or vacation-staging host) is not entitlement proof and must not set `canUpload` for unpaid, public-link, or logged-out actors. Logged-out / public-link / unpaid collaborator sessions must not receive `canUpload: true`.
- Telegram file bytes are not fetched in this dry-run. The lever proves binding and authorization, not storage I/O.
- A caption that names the Vegas trip does not override a stale `bound_trip_id`.
- Staging host or `TIMESYNCHER_MEDIA_UPLOAD_STAGING_BYPASS` must not bypass unauthorized / unpaid / logged-out upload denial.
- Thing-scoped attachments are covered in [Timeline / Thing media](./timeline-thing-media.md).
