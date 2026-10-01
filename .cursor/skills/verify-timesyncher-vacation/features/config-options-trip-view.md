# Standard layout, no view options

Canonical inventory: `features/itinerary-surfaces.md`. GBrain Feature Map is the source. This file is the verification recipe.

Craig's ruling: the itinerary always uses the standard TimeSyncher layout, with no view options. A trip view config control is not a gap.

Drive the real app at the staging shared trip for `testTripSlug` (`verify-config.json`). Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- The itinerary uses the standard TimeSyncher layout, with no view options.

## How to get to it (user POV)

- Open the shared vacation. The tab row is the standard layout. There is no trip view config control.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-itinerary-layout.png`.
- Pass when the live page shows the standard itinerary layout. A missing trip view config control is not a product gap.
- Do not require Config Options, a Trip View menu, or a view toggle.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `testTripSlug` in `verify-config.json`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
