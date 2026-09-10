# Config ON → Style two PDF (proof, hold certify)

SoT: `bot-admin/messages/time-syncher/style-2-journey-book-standard`  
Config: `bot-admin/messages/time-syncher/keepsakes-config-defaults-20260910`

Live travel `…/report/keepsake-style-2.pdf` is TREK `zu()`: cover + day pages only. That **omits** Event summary, Saved stories, list sections, and Day maps while Config is all ON → **not** standard Style-two product code.

Live travel `…/report/keepsake.pdf` is TREK `Ae()`: the Config-coupled product renderer.

| Config option (all ON) | `zu()` style-2 PDF (5 pp) | `Ae()` keepsake PDF (8 pp) |
| --- | --- | --- |
| logo (TIMESYNCHER VACATION) | present | present |
| Initial summary page | present (cover boilerplate) | present (**Trip summary**) |
| Event summary | **missing** | present (You experienced 7 events) |
| Saved stories | **no section** (copy inline on days) | present (**Saved stories**) |
| Restaurants | **missing** | no heading — product `de()` had zero `restaurant` rows; those things sit under Shows/Tours/Rest |
| Shows/Tours/Rest | **missing** | present |
| Stores | **missing** | no heading — product `de()` had zero `store` rows; Cosmopolitan shops is under Rest |
| Day1 map | **missing** | present (Day 1 map) |
| Day2 map | **missing** | present (Day 2 map) |
| Day3 map | **missing** | present (Day 3 map) |

Staging Style two export now uses **`Ae()`** (patch `keepsake-style-2"?zu()` → `Ae()`; PDF 302 to product `keepsake.pdf`). No Cursor HTML book.

Restaurants/Stores headings follow product category filters — do not invent extra list rules.

Hold certify.
