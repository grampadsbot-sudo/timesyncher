# Live composer reply: Jev classify, then model tier

Customer chat on the vacation-app URL. SoT: `bot-admin/messages/time-syncher/craig-lock-live-app-jev-tier-feature-map-20260925`. Shared contract: `bot-admin/skills/time-syncher/vacation-app-reply-rules` (`pipeline: jev_precall_then_tiered_model`).

Hold certify. This inventory is not a certify. The same path is what Dialog uses. It is not Dialog-only.

## Customer path

1. **Composer.** `vacation-app.html` posts the typed or dictated text to `/api/vacation-itinerary?app=1&session=`. The bubble is `data.reply` from that response. There is no canned “Got it. I saved that…” app line.
2. **Jev classify.** `produceLiveAppReply` in `src/vacation/live-app-turn.mjs` calls `jevPrecall` from `scripts/vacation-app-reply-rules.mjs` before any reply model. The stored stamp is `payload.liveTranscript.jev`.
3. **Tier.** When `jevRan` is true, the stamp has `modelTier` (1–4) and `routeType`. `callTieredModel` runs only after that tier exists. Jev may choose 3 or 4 when the turn needs richer banter, a multi-day plan, or a judgment call. A family mention is not by itself a collaborator welcome. A tier outside 1–4 does not call a model.
4. **Reply.** The app row `body` is the tiered model text the customer saw. Prior live turns, including the early trip intake, are sent with the request. If the customer has named the Big Island, a reply that moves the trip to another place is not stored. A session stores at most one full collaborator and access welcome, and only on the turn where the customer asks about price, access, or joining as collaborators. That welcome uses the exact phrase `unlimited vacations for the whole year`. Day-advice turns do not append a welcome paragraph or that phrase. The owner can open collaborator seats. After payment and the in-app terms, each collaborator gets a vacation-app session on the same trip and their lines are stored under their name. The Dialog PDF roster prints Owner, Collaborators with payer, Kids (silent), and Viewer · Editor. Each generated timing line includes gen ms, model, tier, jev ms, and max_tokens. `replyProducer` is `vacation-app-reply-rules`. The only legal model ids are the bake-off map in `dialog-runners/tier_models.json`: T1 `google/gemini-2.5-flash-lite`, T2 `qwen/qwen3-235b-a22b-2507`, T3 `deepseek/deepseek-v3.2`, T4 `qwen/qwen3-max`. Anything else, including a gpt mini model, is refused and no app sentence is stored. The row stores that model id, `jevLatencyMs` for the Jev-first classify, `genLatencyMs` for the reply, and `jevBeforeModel: true` only after Jev has already returned. If Jev does not run, the stamp is `jevRan: false` plus `reason`, and no app sentence is stored. The Dialog PDF cover is the v7 chrome: quality comparison, per-tier models, per-tier mean, and a timings table.
5. **Onboarding opener.** After terms are accepted, the first stored app row is the full welcome the customer sees: trip basics, then a family collaborator path. `replyProducer` is `vacation-app-onboarding-opener`, `jevRan` is false, and the reason is `fixed_onboarding_opener`. That row is the product template, not a generated reply and not a PDF-only line. It does not count as the one customer-pulled upsell. Later app rows still go through Jev, then tier.

## Retired reply

Do not treat these as the composer reply:

- The old canned bubble “Got it. I saved that…”
- Dialog test fingerprint `TS-DIALOG-FINGERPRINT-20260924-bar2` on customer-visible text
- OpenRouter self-call pack fill or `dialog_vacation_test_turn` invented replies

## Sub-features

- `composer-post` sends the customer text and renders only the returned reply.
- `jev-classify` runs `jevPrecall` and stores `jevRan`, tier, and route, or `jevRan: false` and a reason.
- `tier-reply` calls `callTieredModel` with that tier and stores the model text as the app turn.

## How to get to it (user POV)

- Open `vacation-app.html?session=` after the in-app terms are accepted.
- Type in the composer, or use the mic when the browser can transcribe.
- Read the TimeSyncher bubble. That text is the stored app turn.

## Driving it with verify-live-app-jev-tier

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs --self-check
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs --transcript /opt/cursor/artifacts/vegas-live-dialog-pdf-20260925/transcript.json
```

`--session <token>` reads stored `transcript_turns` when `DATABASE_URL` is set. It does not send a new chat turn.

## Gotchas

- A customer turn with `jevRan: false` and a reason is an honest skip. Do not fill in a tier.
- An app turn with `jevRan: false` fails the harness, except the first stored row when it is the fixed onboarding opener (`fixed_onboarding_opener`). Empty text or `invented: true` still fails.
- A generated app turn without a `provider/model` id, without `jevLatencyMs`, or without `jevBeforeModel: true` fails the harness.
- Pack-shape PDF rendering does not create replies. It only prints turns this path already stored.
- The printed APP timing line is `timing: gen=<ms> · tier=<N> · model=<provider/model>`. Cover lists `tiers used` and `models used`. Jev classify ms and `jevBeforeModel` stay on the stored turn. Do not print `tier N | route | X ms | e2e` as that line.
