# Welcome after intake

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real app at `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/`. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- After create-vacation intake finishes, the onboarding chat shows the welcome before the first customer message.
- That welcome includes the collaborator. The structural marker is `upsellFactsForTurn` with `collaborators: true` on a marked intake turn, and `onboardingOpenerFacts` with `first_message: true` and `customer_said: null`.

## How to get to it (user POV)

- Finish create-vacation intake. Open the vacation app. After the name field is filled, check `#eulaAgree` and click `#eulaAgreeButton`. Wait until `#messages[data-screen="onboarding"]` is on screen. The welcome is the TimeSyncher bubble in that list before the first `article.bubble.user`.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs --check`.
- That command creates a real database-backed create-vacation intake through the vacation request handler and opens the vacation app. It fills `#eulaName`, checks `#eulaAgree`, clicks `#eulaAgreeButton`, and waits for `#messages[data-screen="onboarding"]`. If that chat does not appear, the process exits non-zero and prints `FAIL welcome-after-intake: onboarding chat did not open`. It then runs the same welcome check as before. It is not a stub or a fixture transcript.
- `DATABASE_URL` is required. When it is already set, the check uses that value. When it is absent, the check loads the staging project value at runtime with `VERCEL_TOKEN` by `GET https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/A9IvKmyFpAfVBLQx?decrypt=true` (staging project only) and stores it in `process.env` for that process. The value is not printed, logged, written to disk, or put in evidence, screenshots, artifacts, errors, or stack traces.
- When `VERCEL_TOKEN` is missing, the fetch fails, or the response has no value, the process exits non-zero and prints a `FAIL welcome-after-intake:` line that does not include the value. That result is not a pass and not a gap.
- Screenshot `verify-welcome-after-intake.png` when the welcome check runs, after Agree and after the onboarding chat is on screen.
- Pass when, after Agree, the app session shows the welcome bubble in `#messages[data-screen="onboarding"]` before the first customer message, and the existing opener and collaborator markers are present.
- Fail when the onboarding chat does not open, or when the welcome is missing. Do not invent welcome copy in the app.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
- The intake itinerary page is not the onboarding chat. A terms screen is not the welcome. A page with no `#messages` welcome fails this check.
- If `#messages[data-screen="onboarding"]` does not appear after Agree, the check fails with `FAIL welcome-after-intake: onboarding chat did not open`. That timeout is not a pass.
- Missing `DATABASE_URL` does not skip the check. The step loads the staging value, or fails without echoing it.
