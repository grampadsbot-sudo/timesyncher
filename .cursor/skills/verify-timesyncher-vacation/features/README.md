# TimeSyncher Vacation verification map

GBrain Feature Map is canonical. The repo `features/` mirror is the inventory. This directory is the drive. Target the real shared app (`/shared/las-vegas-vacation-3/` and an intake `/shared/intake-…` trip). Never the deleted card shell.

## Baseline preconditions

- Staging alias `https://vacation-staging.timesyncher.com` is the only host.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-feature-map.mjs`. It doctors, runs the real-app gate, and overwrites the PASS/FAIL/GAP table.
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

Each feature file uses `Sub-features`, `How to get to it (user POV)`, `Driving it`, and `Gotchas`. `verify-feature-map.mjs` drives every file and writes the PASS/FAIL/GAP table.

## Features

- [Post-purchase email, then in-app EULA](./post-purchase-email-eula.md)
- [Live composer Jev tier](./live-app-jev-tier.md)
- [Standard itinerary layout](./itinerary-layout.md)
- [Slider bars](./slider-bars.md)
- [Thing pages](./thing-pages.md)
- [Post-intake welcome](./post-intake-welcome.md)
- [Jev quality line](./jev-quality-line.md)
- [Keepsake Style one](./keepsake-style-one.md)
- [Keepsake Style two](./keepsake-style-two.md)
- [Keepsakes config defaults](./keepsakes-config.md)
- [Dialog screenshot gate](./dialog-screenshot-gate.md)
- [Email opens the real app](./real-app-email-entry.md)
- [Search redesign](./search-redesign.md)
- Header, language, voice note, maps, filters, empty states, tags, logos, status, happy hour, hotel, flight, car, ratings, stories, collaborators, budget, packing, print, order keepsakes, trip view, navigation, settings, min things, autonomy, keepsake QA, Telegram intake, the Cursor contract, and the search redesign each have a sibling file with the same drive shape.

## Retired

- Order-success **Open TimeSyncher Vacation** and order-success **Review and Continue** into `/accept` are not features. Do not add them back as customer entry points.
