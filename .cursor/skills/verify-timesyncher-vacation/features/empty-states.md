# Empty states

Canonical inventory: `features/empty-states.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- Empty copy is No restaurants/stores match those tags, or No timeline-tagged things yet for this day.

## How to get to it (user POV)

- If a list or day is empty, that sentence is the proof. A filled Vegas day is not a failure of the copy.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-empty-states.png`.
- Pass when the live page shows the control named above.
- If the app no longer shows it, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
