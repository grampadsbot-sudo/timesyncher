# Telegram intake → GBrain track + build cue

GBrain SoT: `bot-admin/messages/time-syncher/tg-intake-gbrain-track-and-build-cue-20260910`  
Skill: `skills/tg-intake-gbrain-track-and-build/skill`  
Autonomy: `autonomous-app-customer-flow-20260910`

Existing path only (no invented hosts): Telegram bot → `POST /api/vacation-telegram-turn` → worker drain → public research → website.

On vacation-staging, the website link uses `websiteTripBase` → `https://vacation-staging.timesyncher.com/shared/{token}/` so Style two is `Ae()` (Config honor) without a babysitter. Travel remains the default when the site base is not staging. `telegram_launch` accepts both existing hosts. Do not wait on OpenClaw.

## Rules

1. Persist each initial prompt + reply to GBrain (`persistIntakeTurnToGbrain` in `src/vacation/tg-intake-gbrain.mjs`). Slug: `bot-admin/messages/time-syncher/tg-intake/{chat}/{turn}`. Write-through root is existing `privateGBrain` (`/home/ubishere9995/gbrain`) or `gbrain capture` when present.
2. After enough info (vacation name + unforgettable goal + trip details, existing `hasVacationIdentity` / `hasTripPlanningDetails`), reply with **I'm building your initial itinerary now and it may take 10–15 minutes.** then queue autonomous fill.
3. Fill uses confirmed per-category mins **15 / 10 / 15** (`features/min-things.md`).

SCT proves the synthetic Telegram run. Hold certify.
