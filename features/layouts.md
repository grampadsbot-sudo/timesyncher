# Keepsake layouts

**Sole SoT:** `bot-admin/messages/time-syncher/style-2-journey-book-standard`  
CoS dated twin (same rules): `bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910`

Exactly **two** layouts. Style-2 export = the same action as product **Layout 2 / Style two**. Do not invent a third.

| UI | Report name | URL |
| --- | --- | --- |
| Style one | `keepsake` | Staging: `/shared/{token}/journey?style=1&printMode=report&pdfReport=keepsake` (product `Ae()` + `op()` left itinerary). PDF `/api/pdf/shared/{token}/report/keepsake.pdf` 302s to that print. |
| Style two | `keepsake-style-2` | Staging: `/shared/{token}/journey?style=2&printMode=report&pdfReport=keepsake-style-2` (product `Ae(true)` + `Mc()` centered). PDF `/api/pdf/shared/{token}/report/keepsake-style-2.pdf` 302s to that print. Do **not** 302 to travel (`zu()`). |

Product click: **PDFs** → **Keepsakes ▸** → **Style two** (Layout 2).

Staging mirrors (thin SoT):

- View: `/shared/las-vegas-vacation-3/journey?style=2` → product `?printMode=report&pdfReport=keepsake-style-2`
- PDF: `/api/pdf/shared/las-vegas-vacation-3/report/style-2` → staging `Ae()` print (`?printMode=report&pdfReport=keepsake-style-2`). Do **not** 302 to travel (`zu()` / unpatched `keepsake.pdf`).

Skill (in flight): `skills/style-2-journey-book-export`.
