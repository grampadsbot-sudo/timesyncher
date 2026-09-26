# Dialog screenshot gate

SoT: `bot-admin/messages/time-syncher/dialog-screens-real-itinerary-ui-fail-20260926`.

Hold certify. This entry is the fail-closed check. A screen that misses it is a FAIL. Do not substitute the 9/24 CLI shell.

## Real pages (the only screens that can pass)

The real itinerary and Thing UI already in this repo:

| Screen | Where it lives | Feature Map entry |
| --- | --- | --- |
| Itinerary tabs | `shared-app.html` loads the TREK bundle (`/assets/index-BKun7ofk.js`). Tabs are Day-by-Day, Flights, Hotels, Cars, Restaurants, Stores, The Rest. | `itinerary-surfaces.md` |
| Day layout and timeline bars | Vacation Day View: Day 1/2/3 chips, timeline rows, timeline rail. Those timeline bars are the slider bars. | `day-view.md` |
| Thing page | Detail page: Detail name, Days, Timeline, Status, Type, Start, Duration. Opened from **Open thing details**. | `detail-page.md` |

Onboarding for this path stays the app chat after Agree (`post-purchase-email-eula.md`, `data-screen="onboarding"`). It is not an itinerary proof.

## FAIL (closed)

Fail the drop when any required shot shows any of these:

- The CLI shell: `vacation-app.html` path nav with **Onboarding** and **Itinerary** buttons, or `data-screen="itinerary"` / `data-screen="thing"` text cards.
- No timeline / slider bars from `day-view.md`.
- Itinerary layout other than `itinerary-surfaces.md` (no Day-by-Day tab row).
- A Thing page other than `detail-page.md`.

Chat notes rendered as cards are not the itinerary. Do not invent a new itinerary or Thing layout to pass this gate.

## How to check

1. Open the shot.
2. Name the Feature Map entry it is supposed to prove (`itinerary-surfaces.md`, `day-view.md`, or `detail-page.md`).
3. If the pixels are the shell, or the entry's labels are absent, mark that shot FAIL and stop. Do not retake the shell.
