# Post-intake welcome

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- The long-intake reply says the itinerary is being built, names collaborator options, and says unlimited vacations for the whole year once.

## How to get to it (user POV)

- Open the intake session chat and find that reply. Do not start a second gold dialog.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-post-intake.png`.
- Pass when the live page shows the control named above.
- If the app no longer shows it, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
