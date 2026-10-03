# Chat

The customer workspace at `/vacation-app.html?session=` after terms. Selectors are from `vacation-app.html`: `textarea#messageText`, `#attachButton`, `#voiceButton`, `form#composer`, `#messages`, `header.topbar`, `#splitter`, `#tripButton`, `.site-pane iframe`.

## Sub-features

- `app-0-vacations` — the header is absent or its height is 0. Conversation. Text box with the file-add and speak buttons pinned to the bottom. Nothing else. 390x844 and 1280x800.
- `app-1-no-site` — same as zero vacations. No header bar, no dropdown, no website, no slider.
- `app-1-with-site` — header absent or height 0. Vacation website on top, with a full-screen control in the website area. Control slider in the middle. Text box with file-add and speak at the bottom. Nothing else.
- `app-2-plus` — header holds only the vacation dropdown. Website on top, with a full-screen control, and the slider in the middle once the selected vacation has content. Text box at the bottom. Nothing else.
- `website-full-screen` — the website fills the viewport. An exit control returns to the split view. No header, no slider, no text box. The exit control is the only extra button.
- `send-one-message` — type into `textarea#messageText`, submit `form#composer`, and wait until a new `article.bubble` that is not `.user` is in `#messages`.

## How to get to it (user POV)

- `app-0-vacations`: open the purchase email, follow its app link, agree to terms, and land in chat before any vacation exists.
- `app-1-no-site`: that same customer after the first vacation exists and before the website has content.
- `app-1-with-site`: that vacation once the website has content. A staging session already in this state can be passed as `TIMESYNCHER_VERIFY_SESSION`.
- `app-2-plus`: the customer creates a second vacation. The header then shows only the dropdown.
- `website-full-screen`: from a vacation that has a website, use the full-screen control in the website area. The exit control returns to the split view.
- This map does not document a disposable staging coupon. The drive does not sign anyone up and does not click Agree.

## Driving it with puppeteer

Preconditions: `https://vacation-staging.timesyncher.com/api/version` returns 200. Chromium is installed. `TIMESYNCHER_VERIFY_SESSION` is set when a state should be opened. Screen spec file: `features/screens/app.md` (or `features/screens/<state>.md` when Product adds one).

- Open a state: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir> --only chat` loads the session URL at 390x844 (deviceScaleFactor 2, isMobile, hasTouch) and at 1280x800. Observable result: `<dir>/VERIFY.md` has one row per state per viewport, and `<dir>/verify/chat-<state>-<390|1280>.png` exists for a state the session actually reached.
- Send one message: the same command focuses `#messageText`, types a check-in question, and submits `#composer` once. Observable result: the count of `article.bubble:not(.user)` increases. A missing reply is `reply-unmeasured` and the row fails.
- Open website full-screen: the same command clicks the button named Full screen (or `#fullscreenButton`) inside the website area, at both viewports. Observable result: `<dir>/verify/chat-website-full-screen-<390|1280>.png`. The website's box matches the viewport, and Exit full screen (or `#exitFullscreenButton`) is painted. Clicking that exit brings back `#messageText` and `#splitter`. A missing control is `fullscreen-control-unmeasured` and the row fails. It is not skipped.

## Gotchas

- A logo, a send button, Open navigation, or Settings is outside the spec. The row fails.
- With 0 or 1 vacations an empty header bar fails `header-renders`. The header element is absent, or its height is 0.
- The full-screen control is the only extra button on a website. Website full-screen stays a failed row until that control is in the served app. It is not a GAP.
- The text box is `textarea#messageText`. A form edge that sits inside the viewport while the textarea hangs below it fails.
- A state this session is not in is `verified-unreachable` and fails. It is not a pass.
- A missing `features/screens/app.md` fails with `spec-missing`. The judge does not run.
