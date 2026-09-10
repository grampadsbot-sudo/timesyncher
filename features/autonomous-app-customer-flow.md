# Autonomous Vacation app (product end-state)

GBrain: `bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910`

Craig stamp: Vacation rolls out through the **Telegram customer flow under test**, then **runs on its own**, driven by **GBrain + product code + website**. Not a forever bot-babysat demo. SCT proves the Telegram path. Do **not** invent deploy targets.

## Existing rollout path (no new hosts)

1. Telegram intake: `scripts/telegram-vacation-intake-bot.mjs` → `POST /api/vacation-telegram-turn`
2. Website handoff already in code: `telegram_launch` via `/api/vacation-web-access` (`src/vacation/web-access.mjs`)
3. Shared itinerary / keepsakes / budget live on travel + vacation-staging (existing)

## Autonomy bar for current work

These must hold in **code + website** so a Telegram-created trip does not need a babysitter after intake:

| Surface | Required without bot babysit | File |
| --- | --- | --- |
| Create / initial fill | **15 restaurants / 10 stores / 15 The Rest** (not total-8) | `min-things.md` (`scripts/vacation-public-research-worker.mjs:13-16`) |
| Style two | Product path; Config ON → every ON section in PDF (`Ae()`) | `config-on-style-two-proof.md` |
| Budget | Existing TREK inclusion only | `budget.md` |
| Feature Map | Every live UI control | `README.md` |

Hold certify until that bar is QA-provable. SCT owns customer-flow proof; this repo owns code+site.
