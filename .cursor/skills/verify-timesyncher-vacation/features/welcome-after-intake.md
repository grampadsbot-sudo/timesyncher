# Welcome after intake

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at the staging shared trip for `testTripSlug` (`verify-config.json`). Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- After create-vacation intake finishes, the onboarding chat shows the welcome before the first customer message.
- That welcome includes the collaborator. The structural marker is `upsellFactsForTurn` with `collaborators: true` on a marked intake turn, and `onboardingOpenerFacts` with `first_message: true` and `customer_said: null`.

## How to get to it (user POV)

- Finish create-vacation intake. Open the onboarding chat. The welcome is the TimeSyncher bubble in `#messages[data-screen="onboarding"]` before the first `article.bubble.user`.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs --check`.
- That command creates a real database-backed create-vacation intake through the vacation request handler, accepts the terms, and opens the vacation app session. It is not a stub or a fixture transcript.
- `DATABASE_URL` is required. When it is missing the process exits non-zero and prints `FAIL welcome-after-intake: DATABASE_URL missing`. That result is not a pass and not a gap.
- Screenshot `verify-welcome-after-intake.png`.
- Pass when the app session shows the welcome bubble in `#messages[data-screen="onboarding"]` before the first customer message, and the existing opener and collaborator markers are present.
- Fail when the welcome is missing. Do not invent welcome copy in the app.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `testTripSlug` in `verify-config.json`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
- The intake itinerary page is not the onboarding chat. A page with no `#messages` welcome fails this check.
- Missing `DATABASE_URL` fails the check. Do not skip it.
