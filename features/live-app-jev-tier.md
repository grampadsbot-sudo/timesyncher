# Live composer reply: Jev classify, then model tier

Customer chat on the vacation-app URL. SoT: `bot-admin/messages/time-syncher/craig-lock-live-app-jev-tier-feature-map-20260925`. Shared contract: `bot-admin/skills/time-syncher/vacation-app-reply-rules` (`pipeline: jev_precall_then_tiered_model`).

Hold certify. This inventory is not a certify. The same path is what Dialog uses. It is not Dialog-only.

## Customer path

1. **Composer.** `vacation-app.html` posts the typed or dictated text to `/api/vacation-itinerary?app=1&session=`. The bubble is `data.reply` from that response. There is no canned “Got it. I saved that…” app line.
2. **Jev classify.** `produceLiveAppReply` in `src/vacation/live-app-turn.mjs` calls `jevPrecall` from `scripts/vacation-app-reply-rules.mjs` before any reply model. The stored stamp is `payload.liveTranscript.jev`.
3. **Tier.** When `jevRan` is true, the stamp has `modelTier` (1–5) and `routeType`. `callTieredModel` runs only after that tier exists. Jev may choose 3, 4, or 5 when the turn needs richer banter, a multi-day plan, or a family collaborator welcome.
4. **Reply.** The app row `body` is the tiered model text the customer saw. `replyProducer` is `vacation-app-reply-rules`. The row also stores the bake-off model id (`provider/model`), `jevLatencyMs` for the Jev-first classify, `genLatencyMs` for the reply, and `jevBeforeModel: true` only after Jev has already returned. If Jev does not run, the stamp is `jevRan: false` plus `reason`, and no app sentence is stored.
5. **Onboarding opener.** After terms are accepted, the first stored app row is the full welcome the customer sees: trip basics, then a family collaborator path. `replyProducer` is `vacation-app-onboarding-opener`, `jevRan` is false, and the reason is `fixed_onboarding_opener`. That row is the product template, not a generated reply and not a PDF-only line. Later app rows still go through Jev, then tier, and the producer writes banter plus a household welcome when family or price comes up.

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
