# Jev quality line

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at the staging shared trip for `testTripSlug` (`verify-config.json`). Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- Jev (`typesafe/jev-1.13`) only scores. The score line and the one-line fix note are in the Dialog PDF and the JSONL log. They are not painted in the customer app. A rewritten turn is labeled `rewritten by <tier model> (Jev note)`.

## How to get to it (user POV)

- Read a stored generated turn and the pack text. The label is not painted in the chat bubble.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-jev-quality.png` of the customer app, plus the Dialog PDF when a stored turn exists.
- Pass when the customer page does not paint `quality:`. The score line and the one-line fix note belong in the Dialog PDF and the JSONL log.
- If the customer page paints `quality:`, the result is a fail. If the PDF or log drops the score, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `testTripSlug` in `verify-config.json`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
