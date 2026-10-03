# Chat

The customer workspace at `/vacation-app.html?session=` after terms. Selectors are from `vacation-app.html`: `textarea#messageText`, `#attachButton`, `#voiceButton`, `form#composer`, `#messages`, `header.topbar`, `#splitter`, `#tripButton`, `.site-pane iframe`.

## Sub-features

- `app-0-vacations` — header empty; conversation; text box with the file-add and speak buttons pinned to the bottom; nothing else. 390x844 and 1280x800.
- `app-1-no-site` — same as zero vacations. No dropdown, no website, no slider.
- `app-1-with-site` — header empty; vacation website on top; control slider in the middle; text box with file-add and speak at the bottom; nothing else.
- `app-2-plus` — header holds only the vacation dropdown; website on top and slider in the middle once the selected vacation has content; text box at the bottom; nothing else.
- `send-one-message` — type into `textarea#messageText`, submit `form#composer`, and wait until a new `article.bubble` that is not `.user` is in `#messages`.

## How to get to it (user POV)

- `app-0-vacations`: open the purchase email, follow its app link, agree to terms, and land in chat before any vacation exists.
- `app-1-no-site`: that same customer after the first vacation exists and before the website has content.
- `app-1-with-site`: that vacation once the website has content. A staging session already in this state can be passed as `TIMESYNCHER_VERIFY_SESSION`.
- `app-2-plus`: the customer creates a second vacation. The header then shows only the dropdown.
- This map does not document a disposable staging coupon. The drive does not sign anyone up and does not click Agree.

## Driving it with puppeteer

Preconditions: `https://vacation-staging.timesyncher.com/api/version` returns 200. Chromium is installed. `TIMESYNCHER_VERIFY_SESSION` is set when a state should be opened. Screen spec file: `features/screens/app.md` (or `features/screens/<state>.md` when Product adds one).

- Open a state: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir> --only chat` loads the session URL at 390x844 (deviceScaleFactor 2, isMobile, hasTouch) and at 1280x800. Observable result: `<dir>/VERIFY.md` has one row per state per viewport, and `<dir>/verify/chat-<state>-<390|1280>.png` exists for a state the session actually reached.
- Send one message: the same command focuses `#messageText`, types a check-in question, and submits `#composer` once. Observable result: the count of `article.bubble:not(.user)` increases. A missing reply is `reply-unmeasured` and the row fails.

## Gotchas

- A logo, a send button, Open navigation, or Settings is outside the spec. The row fails.
- The text box is `textarea#messageText`. A form edge that sits inside the viewport while the textarea hangs below it fails.
- A state this session is not in is `verified-unreachable` and fails. It is not a pass.
- A missing `features/screens/app.md` fails with `spec-missing`. The judge does not run.
