# Shared trip

The customer trip page. Staging layout proof uses `layoutSharedPath` in `verify-config.json` (`/shared/intake-c15be2f6d7bf/`), the page measured on 10/3. Tabs are buttons whose accessible name is the tab label.

## Sub-features

- `shell` — Open navigation and Settings are absent. No app or brand logo paints. No footer and no build stamp. Nothing is wider than the viewport. An empty white box that still paints fails.
- `day-by-day` — Day-by-Day tab. Its icon is vertically centered in the tab.
- `flights` — Flights tab. Same icon rule.
- `hotels` — Hotels tab. Same icon rule.
- `cars` — Cars tab. Same icon rule.
- `restaurants` — Restaurants tab. Same icon rule.
- `stores` — Stores tab. Same icon rule.
- `the-rest` — The Rest tab. Same icon rule.
- `budget` — Budget tab. Same icon rule.

Each sub-feature is checked at 390x844 and 1280x800.

## How to get to it (user POV)

- From chat, open the vacation website once it has content, or open the shared link the app shows for the trip.
- The tab row is on that page. Choose a tab by its name.

## Driving it with puppeteer

Preconditions: staging `/api/version` returns 200. Chromium launches at both viewports. The shell spec is `features/screens/trip.md`. A tab uses `features/screens/<tab>.md` when that file exists, otherwise `features/screens/trip.md`.

- Open the shell: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir> --only shared-trip` opens `layoutSharedPath` at both viewports. Observable result: `<dir>/verify/shared-trip-shell-<390|1280>.png`. A painted Open navigation button, Settings button, brand logo, or footer fails the row.
- Open a tab: the same command clicks the button whose accessible name is that tab, then measures again. Observable result: `<dir>/verify/shared-trip-<tab>-<390|1280>.png`. A missing button is `tab-unmeasured`. An icon whose center is more than 1.5px from the tab center fails.

## Gotchas

- Open navigation and Settings are deleted. Finding them is a failure, not a pass.
- A hidden panel that still paints, including an empty white box, fails.
- A missing screen spec fails the row. The judge does not invent a spec.
