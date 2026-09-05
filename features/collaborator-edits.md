# Collaborator edits

Collaborator edits let a paid Telegram collaborator change the locked trip the same way the owner does, while a public-link visitor stays view-only.

## Sub-features

- `collab-paid-telegram` allows an authorized Telegram collaborator to run the shared pipeline.
- `collab-public-link-reject` rejects edits and uploads from a public URL visitor.
- `collab-checkout` offers the $15 one-vacation and $27 all-vacations Telegram add-on.
- `collab-web-editor` uses an owner-approved email magic link, not the public slug.

## How to get to it (user POV)

- Owner asks Telegram to add a spouse or collaborator and receives `/addons-checkout.html`.
- Paid collaborator taps the Telegram start token from the invite email.
- Staging broker (no live Stripe): `POST /api/admin-onboardings?action=create-collaborator-invite` creates the pending owner-invite token, then marks it paid via checkout-coupon or `ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT` / staging-card checkout. Deep link is `https://t.me/TimeSyncherVacationStagingBot?start=<token>`.
- Visitor opens `/shared/<slug>` with no collaborator session.
- Website editor accepts `/api/vacation-web-access?action=accept&token=...`.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Policy unit tests remain green: `npm run test:vacation-collaborators` and `npm run test:vacation-web-access`.

- **Authorized voice edit.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/telegram-voice-audio.json --json`. Actor role is `telegram_collaborator` and a `move_thing` write is planned.
- **Public-link upload reject.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload.json --json`. Actor is `public-link-visitor`, not the owner. `no_ops[0].reason` is `unauthorized_upload` and the reply contains `not authorized`.
- **Second-identity unpaid collaborator.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload-unpaid-collaborator.json --json`. Kim (`collaborator-kim-unpaid`) is a different identity from `owner-craig` on `authorized-owner-upload`. Same media payload, no write.
- **Logged-out / unauth fixture.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/unauthorized-upload-logged-out.json --json`. Session is null.
- **Denied copy.** The pipeline reply matches the product denied copy: paid Telegram collaborator or owner-approved email magic link, not a public URL grant.
- **Proof.** Record surface, actor role, and the no-op or planned write in `events.jsonl`.
- **Staging paid start token (no live Stripe).** `node scripts/mint-staging-collaborator.mjs` (local dry-run) or `node scripts/mint-staging-collaborator.mjs --remote` with `TIMESYNCHER_ADMIN_TOKEN`. Live path is owner invite → `pending_payment` → `POST /api/checkout-coupon` or `POST /api/create-payment-intent` `complete_staging_collaborator_checkout`. There is no plain `admin_no_charge` collaborator mint.

```bash
curl -sS -X POST \
  'https://vacation-staging.timesyncher.com/api/admin-onboardings?action=create-collaborator-invite' \
  -H 'Authorization: Bearer $TIMESYNCHER_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "tripId": "aba991d7-894f-4b4c-a548-cb7510581182",
    "sessionToken": "6CTRnW4Ca2MW_bsj6hqJozxW",
    "requestedFor": "Kim Rivera",
    "plan": "single_trip",
    "dryRun": true
  }'
```

Dry response shape (no secrets):

```json
{
  "ok": true,
  "dryRun": true,
  "status": "collaborator_staging_card_paid",
  "paidVia": "staging_card_checkout",
  "collaboratorInvite": {
    "id": "dry-run-invite",
    "status": "paid",
    "plan": "telegram_collaborators_single_trip",
    "requestedFor": "Kim Rivera",
    "tripId": "aba991d7-894f-4b4c-a548-cb7510581182",
    "telegramUrl": "https://t.me/TimeSyncherVacationStagingBot?start=<token>"
  }
}
```

## Gotchas

- The shared website is view-only for anyone who only has the public URL.
- "Can my wife Kim change the Vegas site?" is a support/account question, not a write.
- Do not treat an invited website editor as a Telegram collaborator.
- Unauthorized upload and unauthorized edit share fail-closed behavior but different fixtures.
- Do not infer owner/`canEdit` from `customer_id` alone. `staging_bypass` is not entitlement proof.
- Cannot mint a paid collaborator start token with admin auth alone. Missing mark-paid path: set `ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT=true` on vacation-staging, or pass `couponCode` from `action=create-coupon`.
