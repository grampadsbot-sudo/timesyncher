# Post-purchase verification map

Maintained source for the TimeSyncher Vacation purchase-launch path. Product inventory: `features/post-purchase-email-eula.md`. Read this index, then drive the feature file.

## Baseline preconditions

- Staging alias `https://vacation-staging.timesyncher.com` is the only host.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor` before a live drive.
- Evidence for a redeem already captured lives in `/opt/cursor/artifacts/craig-811-email-eula-20260925/` unless the run names another directory.
- Do not treat order-success Open App or `/accept` as a substitute entry point.

## Driving conventions

- Start from the purchase email body. Open the href in that body.
- A drive that never reads the email is a failed drive, even if the app URL was known another way.
- Order-success is only the purchase acknowledgement.

## Proof and skip reporting

- Capture the email body and the app URL it contains before any EULA or chat shot.
- EULA proof is `#eulaScreen` on `vacation-app.html?session=`, with no workspace yet.
- Chat proof is the empty onboarding workspace (`no vacations yet`, chat-only) after Agree.
- Report a skipped email as failed, not as verified through order-success.

## Feature entry contract

Each feature file uses `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-post-purchase-email-eula`, and `Gotchas`.

## Features

- [Post-purchase email, then in-app EULA](./post-purchase-email-eula.md) covers purchase ack, the email launch link, EULA on the app URL, and onboarding chat.
- [Live composer Jev tier](./live-app-jev-tier.md) covers Jev classify, then the model tier, then the stored reply. Product inventory: `features/live-app-jev-tier.md`.

## Retired

- Order-success **Open TimeSyncher Vacation** and order-success **Review and Continue** into `/accept` are not features. Do not add them back as customer entry points.
