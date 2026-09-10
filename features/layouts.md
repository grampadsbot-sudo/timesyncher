# Keepsake layouts

**Sole SoT:** `bot-admin/messages/time-syncher/style-2-journey-book-standard`  
CoS dated twin (same rules): `bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910`

Exactly **two** layouts. Style-2 export = the same action as product **Layout 2 / Style two**. Do not invent a third.

| UI | Report name | URL |
| --- | --- | --- |
| Style one | `keepsake` | `/api/pdf/shared/{token}/report/keepsake.pdf` |
| Style two | `keepsake-style-2` | `/api/pdf/shared/{token}/report/keepsake-style-2.pdf` |

Product click: **PDFs** → **Keepsakes ▸** → **Style two** (Layout 2).

Staging mirrors (thin SoT):

- View: `/shared/las-vegas-vacation-3/journey?style=2` → product `?printMode=report&pdfReport=keepsake-style-2`
- PDF: `/api/pdf/shared/las-vegas-vacation-3/report/style-2` → product `keepsake-style-2.pdf`

Skill (in flight): `skills/style-2-journey-book-export`.
