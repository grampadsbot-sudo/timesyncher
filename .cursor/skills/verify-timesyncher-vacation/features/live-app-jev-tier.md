# Live composer reply: Jev, then tier

The vacation-app composer classifies the customer turn with Jev, then calls that model tier, then shows that reply. Dialog uses the same shared producer.

## Sub-features

- `composer-post` posts the customer text and renders `data.reply` only.
- `jev-classify` stores `jevRan` with tier and route, or `jevRan: false` and a reason.
- `tier-reply` stores the tiered-model text as the app turn from `vacation-app-reply-rules`. An empty model reply is regenerated once before the turn is refused. At most one full collaborator and access welcome is stored, and only after the customer asks about price, access, or joining. That welcome keeps the exact phrase `unlimited vacations for the whole year`. Day advice does not append it. A Big Island trip stays on the Big Island for the whole session. Paid collaborators join the same trip after terms and their customer lines keep their names. The PDF timing line includes jev ms.
- `onboarding-opener` stores the full welcome the customer sees as turn 1 after Agree: trip basics and a family collaborator path. `jevRan` is false with reason `fixed_onboarding_opener`. It is not a generated reply.
- `model-timing` stores the bake-off model id, Jev classify ms, and gen ms, and records that Jev finished before the model call. Legal ids are only T1 `google/gemini-2.5-flash-lite`, T2 `qwen/qwen3-235b-a22b-2507`, T3 `deepseek/deepseek-v3.2`, and T4 `qwen/qwen3-max` from `dialog-runners/tier_models.json`. A gpt mini id or any other model fails the check. The PDF prints `timing: gen=<ms>ms model=<id> tier=<N> jev=<ms>ms max_tokens=<n>` and a v7 cover with quality comparison, per-tier models, and a timings table.

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
