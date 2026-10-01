# Welcome after intake

Canonical inventory: `features/jev-quality-post-intake.md`. GBrain Feature Map is the source. This file is the verification recipe.

Drive the real staging app after a fresh signup. Never drive the deleted shell (Onboarding / Itinerary buttons, `data-screen="itinerary"` cards).

## Sub-features

- After the customer agrees, the app welcome is in the onboarding chat before the first customer turn.
- The owner welcome and the collaborator welcome are the canned templates in `content/onboarding-welcome.json`. The check renders them with `renderOnboardingWelcome` from `src/vacation/onboarding-welcome.mjs`. Only the placeholders are filled in.
- The judge grades the replies to the long voice note, the short trip, and the question-first turn.
- A non-empty bubble is not a pass.

## How to get to it (user POV)

- Open the vacation app for a new customer. After the name field is filled, check `#eulaAgree` and click `#eulaAgreeButton`. Wait until `#messages[data-screen="onboarding"]` is on screen. The welcome is the TimeSyncher bubble in that list before the first `article.bubble.user`.
- The next three fresh trips each get one customer turn: a long voice note, a short trip, and a question about whether someone else can see the plan.
- The collaborator opens the same trip. Every turn in that chat stays visible, and each bubble is labeled with its real author.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs --check`.
- That command creates a real database-backed customer, opens the vacation app, fills `#eulaName`, checks `#eulaAgree`, clicks `#eulaAgreeButton`, and waits for `#messages[data-screen="onboarding"]`. If that chat does not appear, the process exits non-zero and prints `FAIL welcome-after-intake: onboarding chat did not open`. It then sends the three fixtures on separate fresh trips and writes a judge packet. It does not invent welcome copy.
- `DATABASE_URL` is required. When it is already set, the check uses that value. When it is absent, the check loads the staging project value at runtime with `VERCEL_TOKEN` by `GET https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/A9IvKmyFpAfVBLQx?decrypt=true` (staging project only) and stores it in `process.env` for that process. The value is not printed, logged, written to disk, or put in evidence, screenshots, artifacts, errors, or stack traces.
- When `VERCEL_TOKEN` is missing, the fetch fails, or the response has no value, the process exits non-zero and prints a `FAIL welcome-after-intake:` line that does not include the value. That result is not a pass and not a gap.
- The packet is `/opt/cursor/artifacts/onboarding-welcome-judge/packet.json` and `packet.md`, with screenshots in that directory. Screenshot `verify-welcome-after-intake.png` is the first welcome, after Agree and after the onboarding chat is on screen.
- The owner welcome must match `renderOnboardingWelcome({ audience: 'owner', firstName, tripSiteUrl })`, with whitespace collapsed, and it must arrive before the customer's first turn. The collaborator welcome must match `renderOnboardingWelcome({ audience: 'collaborator', collabFirstName, ownerFirstName, tripTitle, tripSiteUrl })`, and it must arrive before the collaborator's own first message.
- The same gates fail when a reply mentions tier, route, model, or Jev; when the long voice-note reply does not end with exactly one question; when a collaborator bubble labels a turn as someone else (the owner's voice note labeled `You` fails); or when access is granted instead of offered.
- A generated fixture literal in a shipped template still fails the run.
- Each run stamps the staging build SHA at the start and at the end. The stamp reads `/api/version`, response headers, and meta tags on `/`, `/vacation-app.html`, and `/shared/`. A missing SHA is recorded as `UNKNOWN` with the targets that were checked. Each EULA accept time is recorded.
- Each run writes a fresh `judge-raw.json`. The file is stamped with that run's id and the build SHA from `/api/version`, and `writtenAt` is the time it was written. The gate fails when the file is missing, the run id differs, the SHA is empty or differs, or `writtenAt` is missing or earlier than the run start. `--apply-judge` rejects a stale grade the same way, including an older file that only has a previous run's id.
- The build stamp is also read from each page's DOM: `meta[name="timesyncher-build"]`, or `html[data-build-sha]` when that meta is absent. The packet records those stamps. The gate fails when a page stamp is empty or differs from `/api/version`.
- The welcome's `tripSiteUrl` is loaded. The gate fails when the URL is missing, the response is 404, or the body contains `Invalid or expired link`.
- A separate fresh account with no destination is opened. The check clicks the vacation selector open (`#tripButton`, or the Area `<select>`), then screenshots it with the options visible as `no-vacations-dropdown.png`. The gate fails unless that account has zero vacations, the selector is open, nothing is preselected, the option list is empty, and the open control shows no text: no place names, and no ids or slugs such as `shell-…`.
- Pass only when those gates are clear and the external judge grades a pass on the later replies. Do not mark a pass from shape alone.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- The intake itinerary page is not the onboarding chat. A terms screen is not the welcome. A page with no `#messages` welcome fails this check.
- If `#messages[data-screen="onboarding"]` does not appear after Agree, the check fails with `FAIL welcome-after-intake: onboarding chat did not open`. That timeout is not a pass.
- Fixture values are generated on every run. Do not commit a real place name as a fixture.
- Missing `DATABASE_URL` does not skip the check. The step loads the staging value, or fails without echoing it.
- Seeing the owner's turns in the collaborator chat is expected. The label on each turn is the check.
