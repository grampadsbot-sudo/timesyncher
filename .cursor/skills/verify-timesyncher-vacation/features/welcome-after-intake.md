# Welcome after intake

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- After create-vacation intake finishes, the onboarding chat shows the welcome before the first customer message.
- That welcome includes the collaborator. The structural marker is `upsellFactsForTurn` with `collaborators: true` on a marked intake turn, and `onboardingOpenerFacts` with `first_message: true` and `customer_said: null`.

## How to get to it (user POV)

- Finish create-vacation intake. Open the onboarding chat. The welcome is the TimeSyncher bubble in `#messages[data-screen="onboarding"]` before the first `article.bubble.user`.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-welcome-after-intake.png`.
- Pass when that bubble is on the live page and the structural marker is present.
- Fail when the welcome is missing. Do not invent welcome copy in the app.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
- The intake itinerary page is not the onboarding chat. A page with no `#messages` welcome fails this check.
