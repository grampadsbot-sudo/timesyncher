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

## Gotchas

- The shared website is view-only for anyone who only has the public URL.
- "Can my wife Kim change the Vegas site?" is a support/account question, not a write.
- Do not treat an invited website editor as a Telegram collaborator.
- Unauthorized upload and unauthorized edit share fail-closed behavior but different fixtures.
