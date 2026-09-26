# Print and PDF

Canonical inventory: `features/print-pdf.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- PDFs opens a menu titled Print / PDF, with Daily printout and list PDFs.

## How to get to it (user POV)

- Click PDFs.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-print-pdf.png`.
- Pass when the live page shows the control named above.
- If the app no longer shows it, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
