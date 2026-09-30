# Cursor project contract

Canonical inventory: `features/cursor-project-contract.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- Five hard rules live on disk for agents. There is no customer control.

## How to get to it (user POV)

- Confirm AGENTS.md and the style-two rule file exist. No guest click is required.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-cursor-contract.png`.
- Pass when `AGENTS.md` and `.cursor/rules/style-two-keepsake-contract.mdc` are on disk. There is no guest control to click.
- If those files are missing, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
