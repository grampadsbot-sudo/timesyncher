# Welcome after intake

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real staging app after a fresh signup. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- After the customer agrees, the app welcome is in the onboarding chat before the first customer turn.
- The judge grades that welcome, the collaborator welcome, and the replies to the long voice note, the short trip, and the question-first turn.
- A non-empty bubble is not a pass.

## How to get to it (user POV)

- Open the vacation app for a new customer. After the name field is filled, check `#eulaAgree` and click `#eulaAgreeButton`. Wait until `#messages[data-screen="onboarding"]` is on screen. The welcome is the TimeSyncher bubble in that list before the first `article.bubble.user`.
- The next three fresh trips each get one customer turn: a long voice note, a short trip, and a question about whether someone else can see the plan.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs --check`.
- That command creates a real database-backed customer, opens the vacation app, fills `#eulaName`, checks `#eulaAgree`, clicks `#eulaAgreeButton`, and waits for `#messages[data-screen="onboarding"]`. It then sends the three fixtures on separate fresh trips and writes a judge packet. It does not invent welcome copy.
- `DATABASE_URL` is required. When it is already set, the check uses that value. When it is absent, the check loads the staging project value at runtime with `VERCEL_TOKEN` and stores it in `process.env` for that process. The value is not printed, logged, or written to the packet.
- When `VERCEL_TOKEN` is missing, the fetch fails, or the response has no value, the process exits non-zero and prints a `FAIL welcome-after-intake:` line that does not include the value.
- The packet is `/opt/cursor/artifacts/onboarding-welcome-judge/packet.json` and `packet.md`, with screenshots in that directory. Screenshot `verify-welcome-after-intake.png` is the first welcome.
- Deterministic gates fail the run when the welcome is missing before the first customer turn, the welcome contains Thing, EULA, terms, seat, payments, or reservations, a generated fixture literal appears in a shipped template, or the welcome has no mic or voice-note invitation.
- Pass only when those gates are clear and the external judge grades a pass. Do not mark a pass from shape alone.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- The intake itinerary page is not the onboarding chat. A terms screen is not the welcome. A page with no `#messages` welcome fails this check.
- If `#messages[data-screen="onboarding"]` does not appear after Agree, the check fails with `FAIL welcome-after-intake: onboarding chat did not open`.
- Fixture values are generated on every run. Do not commit a real place name as a fixture.
