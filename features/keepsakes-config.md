# Keepsakes → Admin/Config

GBrain: `bot-admin/messages/time-syncher/keepsakes-config-defaults-20260910`

**UI path:** PDFs → Keepsakes → Admin/Config

Live menu chrome: **PDFs** → **Keepsakes ▸** → **Admin ▸**.

Do not invent options. Stamp the CoS live dump.

## Defaults (all ON as of live dump)

| Option | Default |
| --- | --- |
| logo | ON |
| Initial summary page | ON |
| Event summary | ON |
| Saved stories | ON |
| Restaurants | ON |
| Shows/Tours/Rest | ON |
| Stores | ON |
| Day1 map | ON |
| Day2 map | ON |
| Day3 map | ON |

**Not in Config:** no media toggle, no QR toggle (video QR is a product content rule, not a Config switch).

## Live TREK labels (same panel, not extra options)

From `index-BKun7ofk.js`:

| CoS option | Live button / heading |
| --- | --- |
| logo | TimeSyncher Vacation logo |
| Initial summary page | Initial summary page |
| Event summary | Event summary |
| Saved stories | Saved stories |
| Restaurants | Restaurants |
| Shows/Tours/Rest | Shows, Tours and the Rest |
| Stores | Stores |
| Day1–3 map | heading **Daily maps**; **Day {n} map** |

Storage: `thingOverrides.__keepsakePrintSettings`. Off-only query: `ksLogo`, `ksSummary`, `ksEventSummary`, `ksStories`, `ksRestaurants`, `ksRest`, `ksStores`, `ksMapOff`.
