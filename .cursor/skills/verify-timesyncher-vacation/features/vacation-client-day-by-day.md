# Vacation client preview — Day-by-Day (P2.3)

React preview entry `vacation-app-next.html` (not production `/shared/`). Uses the NYC PR225 offline fixture slug `intake-c15be2f6d7bf`.

## Sub-features

- `day-by-day-timeline` — Vacation Day View heading, day chips, timeline rows with times/durations/travel, itinerary notes, map below itinerary (R8).
- `day-by-day-layout` — No horizontal overflow at 390×844 and 1280×800; timeline icon centring ≤ 0.5 px vs item title (R1).

## Rerun fixture (CI-parity)

From repo root (requires Chrome at `CHROME_PATH` or `/usr/local/bin/google-chrome`):

```bash
node apps/vacation-client/test/day-layout.mjs
node apps/vacation-client/test/dayTimeline.unit.mjs
```

Full vacation-client chrome suite (shell + list + day):

```bash
node scripts/test_shared_category_tab_icon_center_chrome.mjs
```

Artifacts default to `evidence/vacation-client-p2-3-day/` (`day-by-day-390.png`, `day-by-day-1280.png`, day 5 variants).
