---
name: verify-timesyncher-vacation
description: "Drive the served TimeSyncher Vacation app on vacation-staging at 390x844 and 1280x800. Use after an app change, for the daily maintain pass, or whenever chat, checkout, or the shared trip should be checked against the screen spec."
---

# Verify TimeSyncher Vacation

The instance is staging. The customer surfaces are the chat workspace, signup, and the shared trip. Geometry is measured in Chromium. A vision judge reads Product's screen spec and the screenshot. Tolerances are the table in `layout-tolerances.json`.

Craig, 2026-10-03 9:26 AM PT: "It's a Grok-like text interface: just a text box with the file-add and speak buttons. The dropdown of vacations shows up if a customer has more than one vacation. Otherwise nothing in the header. The vacation website shows up on top once it has stuff in it. There is a control slider in the middle once the vacation shows up. Nothing else." The trip page's Open navigation / Settings menu is deleted.

## Launch

Staging is already running. Do not start a second host.

- Alias: `https://vacation-staging.timesyncher.com`
- Ready when `GET /api/version` returns 200 and a sha, and this doctor prints `sha <sha>`:

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --doctor
```

`--doctor` is the readiness check below. It does not deploy.

## Doctor

One read-only check:

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --doctor
```

The doctor fails unless all of these hold:

- `GET /api/version` is 200 and the JSON includes `sha`
- `/vacation-app.html`, `/`, and `layoutSharedPath` from `verify-config.json` load
- each page's `meta[name="timesyncher-build"]` or `html[data-build-sha]` matches that sha
- Chromium opens at 390x844 (deviceScaleFactor 2, isMobile, hasTouch) and at 1280x800, and `innerWidth`/`innerHeight` match

A doctor failure overwrites `<out>/VERIFY.md` with a failed readiness row. It is not a pass.

## Drive

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir>
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir> --only chat
```

`<dir>` defaults to `.cursor/skills/verify-timesyncher-vacation/output`. The command opens the surfaces in `features/`, at both viewports, using the selectors in those files (`#messageText`, `#attachButton`, `#voiceButton`, `#composer`, `#messages`, `#splitter`, `#tripButton`, tab buttons by accessible name). It writes `<dir>/VERIFY.md`.

Set `TIMESYNCHER_VERIFY_SESSION` to an accepted app URL or session token to open chat. Leave it unset and the four chat states are `verified-unreachable`. That is a failed row. The command does not create an account and does not redeem a coupon.

Screen specs are read at runtime from `features/screens/<screen>.md`, with `features/screens/app.md` for the chat states and `features/screens/trip.md` for the trip when a narrower file is absent. A missing spec is `spec-missing` and the row fails.

The layout column is measured geometry (composer inside the viewport and pinned to the bottom, no element wider than the viewport, header and logo, hidden elements that still paint, footer, tab icon centering, conversation between header and composer). The judge column is one vision call per screenshot. `OPENROUTER_API_KEY` is required. A missing key, timeout, or transport error fails the judge. It is not skipped.

The process exits non-zero when any row is not PASS. A GAP is allowed only when that feature file says `status: not-built`.

## Evidence

Proof stays in `<dir>`: `VERIFY.md`, `measurements.json`, and `verify/<feature>-<subfeature>-<390|1280>.png` plus the full-page `*-page.png` and a JSON sidecar. The judge's verdict and mismatches are in that sidecar. The harness does not delete this directory.

## Cleanup

The harness closes the Chromium process it launched. It does not delete `<dir>`, coupons, or staging data. `--self-check` uses a temp directory and removes that temp directory before it exits. Skill files and a caller's evidence directory stay.

## Helpers

Every script is run with `node`. The entry is executable in the sense the repo runs it with `node`, not a shell chmod gate.

- `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --self-check` proves the gate offline. The 10/3 probe boxes fail (composer bottom below 844, header width 479 at 390, Open navigation and Settings painted). A correct 390 page passes. A missing spec, unmeasured composer, missing screenshot, judge error, and judge timeout each fail. When Chromium is installed it also renders `p0OffscreenHtml()` and `correctApp0Html()` and checks those measurements. No network.
- `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --doctor` is the readiness check.
- `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir>` drives every feature.
- `node .cursor/skills/verify-timesyncher-vacation/scripts/layout-self-check.mjs` is the same offline proof, called by `--self-check`.

`scripts/test_verify_vacation_layout_self_check.mjs` is on `scripts/offline-tests.txt`, so CI runs the offline proof and does not call staging.

## Maintain

Once a day, one live session:

1. Run the doctor.
2. Run the full drive with `TIMESYNCHER_VERIFY_SESSION` when a chat session is available, and with `OPENROUTER_API_KEY` set.
3. Read `<dir>/VERIFY.md`.

Outcome is `clean` when every row is PASS, `changed` when any row fails because the served UI differs from the screen spec, and `blocked` when the doctor fails, the judge key is missing, or a sub-feature is verified-unreachable. Open at most one PR for that pass, and only for a `changed` outcome. Do not open a second PR in the same pass.
