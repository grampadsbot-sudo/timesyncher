# Keepsake QA — Style-two Config honor + live site vs Feature Map

**SoT:** `bot-admin/messages/time-syncher/keepsake-qa-site-and-config-20260910`  
**Date:** 2026-09-10  
**Craig via CoS:** two checks. Gaps = **FAIL verified**. **Hold certify.** Do not invent Config options, inclusion rules, or a third layout.

## Verdict

**FAIL verified.** Hold certify. Do not route PASS.

Remaining certify blocker:

1. Product **travel** click path **Style two** still uses `zu()` (`keepsake-style-2.pdf`). That renderer **omits** Config-ON sections (Event summary, Saved stories section, lists, Day 1–3 maps). Staging product path uses `Ae()` and **does** honor those sections.

Feature Map walk found unmapped live detail/header facts. Those are **stamped** in `features/` from live `index-BKun7ofk.js` (not invented). Stamping closes the inventory gap; it does **not** certify.

## Check 1 — Style-two PDF must honor every ON Config section

**LIVE Config** (PDFs → Keepsakes → Admin/Config, all ON): logo, Initial summary page, Event summary, Saved stories, Restaurants, Shows/Tours/Rest, Stores, Day 1 / Day 2 / Day 3 maps.  
**Not in Config:** media / QR. Do not invent.

### Product travel click (FAIL)

`GET https://travel.timesyncher.com/api/pdf/shared/las-vegas-vacation-3/report/keepsake-style-2.pdf`  
Renderer: `zu()` (`keepsake-style-2`). Pages: **5**.

| Config ON | In `zu()` PDF |
|---|---|
| logo | yes (cover) |
| Initial summary | cover-only (not Config summary page) |
| Event summary | **no** |
| Saved stories (section) | **no** (pics-in-day only) |
| Restaurants / Rest / Stores lists | **no** |
| Day 1–3 maps | **no** |

### Staging product Style-two path (`Ae()`, Config-coupled)

`GET …/api/pdf/shared/las-vegas-vacation-3/report/style-2` → 302 → travel `keepsake.pdf` (`Ae()`). Pages: **8**.

| Config ON | In `Ae()` PDF |
|---|---|
| logo | yes |
| Initial summary | Trip summary |
| Event summary | You experienced 7 events |
| Saved stories | Saved stories section |
| Shows/Tours/Rest | list + Hotels |
| Restaurants / Stores headings | **no heading** — product `de()` has zero `restaurant`/`store` rows (Carbone / Cosmopolitan shops under Rest). Do not invent extra list rules. |
| Day 1–3 maps | pages 4–6 |

Artifacts: `/opt/cursor/artifacts/keepsake-qa-20260910/` (`ae-p-1.png`, `ae-p-2.png`, `ae-map-4.png`, `zu-p-1.png`).

**Close the travel click FAIL:** product must route Style two to `Ae()` (or a real product Style-two that honors Config). Do not invent a third renderer. Staging already 302s Style two PDF to product `keepsake.pdf`.

## Check 2 — live shared site vs Feature Map full UI inventory

Walked `https://travel.timesyncher.com/s/las-vegas-vacation-3` and live bundle `index-BKun7ofk.js` (2026-09-10). Feature Map SoT: `feature-map-full-ui-inventory-rule-20260910`.

### Live and already mapped (not a gap)

Brand, Config Options → Trip View (Flights / Hotels / Cars ON), PDFs menu (Daily 1–3, Style one / Style two, Admin 10 toggles all ON, list PDFs), tabs Day-by-Day / Flights / Hotels / Cars / Restaurants / Stores / The Rest / Budget, day pills + map copy, The Rest filters (All areas / All types), ratings/reviews, view-only invite line, Budget buckets + Add price.

Packing / Chat **absent** — `share_packing=false`, `share_collab=false`. Correctly gated (`packing.md`, `collaborators.md`).

Day-by-Day has **no** filter row — `filters.md` already says filters are **list tabs only**.

Happy hour **not** on Carbone — `happy-hour.md` is restaurant/bar (`zi(Dt)`). Carbone is not on the Restaurants tab. Do not invent a happy-hour field for non-restaurant types.

Empty Restaurants / Stores tabs match `empty-states.md`.

**Order Keepsakes** is in the shared-trip header JS as an **icon** (`aria-label` always; text only when selected). A walk that only looks for the words is not a missing-control fail.

**Change language** is login/landing chrome (`language.md`), not a shared-trip header `aria-label`.

**Enter fullscreen** / **Exit fullscreen** are Mapbox `FullscreenControl` labels (`maps.md`), not a shared-header Expand button. Do not invent a header expand control.

### Gaps found on walk — now stamped (inventory only)

| Live UI (product JS) | Before this QA | Stamp |
|---|---|---|
| Detail **Price**, **Estimated travel time**, **Summary**, **Story**, recap checkbox, **Website**, **Details**, multi-day schedule | missing from `detail-page.md` | `detail-page.md` |
| **Restaurant tags / chips** / **Store tags / chips** + live `ot` / `gt` | missing | `tags-chips.md` |
| Ratings live label **Google rating** | mapped as “Rating” | `ratings-reviews.md` |
| Header icon-only vs language/fullscreen role | `header-chrome.md` incomplete | `header-chrome.md`, `language.md`, `maps.md`, `order-keepsakes.md` |

Language icon on an earlier walk surfaced a device/mic error (“Requested device not found”). That is a device/runtime issue, not a Feature Map invention.

## Hold certify

Do not claim verify-PASS. Route PASS only via CoS after travel Style-two honors Config. Feature Map stamps are inventory, not certify.
