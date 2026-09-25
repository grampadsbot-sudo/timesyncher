# Live composer reply: Jev, then tier

The vacation-app composer classifies the customer turn with Jev, then calls that model tier, then shows that reply. Dialog uses the same shared producer.

## Sub-features

- `composer-post` posts the customer text and renders `data.reply` only.
- `jev-classify` stores `jevRan` with tier and route, or `jevRan: false` and a reason.
- `tier-reply` stores the tiered-model text as the app turn from `vacation-app-reply-rules`.
- `onboarding-opener` stores the fixed welcome the customer sees as turn 1 after Agree. `jevRan` is false with reason `fixed_onboarding_opener`. It is not a generated reply.

## How to get to it (user POV)

- Open the app URL after Agree.
- Send a message from the composer.
- The TimeSyncher bubble is the stored reply. Nothing else is inserted for the customer.

## Driving it with verify-live-app-jev-tier

Preconditions:

- Source check passes with no network.
- A live proof uses a dumped transcript or `--session` against stored turns. Do not invent a reply to satisfy the check.

- **Source.** `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs` reads the composer, the itinerary API, and `produceLiveAppReply`. Jev is called before the tiered model. The canned bubble is absent.
- **Skip shape.** `--self-check` accepts `jevRan: false` plus a reason and rejects a missing reason, a tier-less `jevRan: true`, a canned app line, and `invented: true`.
- **Live proof.** `--transcript` or `--session` requires at least one app turn with `jevRan: true`, an integer tier, and a route. App text must be the stored producer text. The first app row may be the fixed onboarding opener with `jevRan: false` and reason `fixed_onboarding_opener`.

## Gotchas

- Do not invent Jev fields when classify did not run. The onboarding opener stays `jevRan: false`.
- Do not treat a Dialog pack sim or `dialog_vacation_test_turn` fill as this path.
- Pack-shape PDFs are a print of these stored turns. They are not a second reply generator.
