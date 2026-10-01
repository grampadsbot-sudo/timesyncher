# Order Keepsakes

Canonical inventory: `features/order-keepsakes.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at the staging shared trip for `testTripSlug` (`verify-config.json`). Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- The shared-trip header includes Order Keepsakes. It is not an item in the PDFs menu.

## How to get to it (user POV)

- Click the header button Order Keepsakes.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-order-keepsakes.png`.
- Pass when the live page shows the control named above.
- If the app no longer shows it, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `testTripSlug` in `verify-config.json`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
