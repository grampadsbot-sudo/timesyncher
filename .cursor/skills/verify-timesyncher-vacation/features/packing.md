# Packing

Canonical inventory: `features/packing.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at the staging shared trip for `testTripSlug` (`verify-config.json`). Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- The Packing tab appears only when share_packing is on.

## How to get to it (user POV)

- Look for a Packing tab.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-packing.png`.
- Pass on `testTripSlug` when `share_packing` is off and the Packing tab is absent. Pass on a trip with the flag on when the tab is visible.
- If the flag is on and the tab is missing, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `testTripSlug` in `verify-config.json`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
