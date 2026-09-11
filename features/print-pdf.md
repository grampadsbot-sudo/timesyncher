# Print / PDF

Header button `aria-label="PDFs"`. Menu title: **Print / PDF**.

Live items (`index-BKun7ofk.js`):

- **Daily printout ▸** → Day {n} [· date] → `/api/pdf/shared/{token}/daily/{n}.pdf`
- **Keepsakes ▸** → Style one / Style two / Admin ▸
- **Restaurants** → `report/restaurants.pdf`
- **Stores** → `report/stores.pdf`
- **The Rest** → `report/rest.pdf`
- **Complete List** → `report/complete-list.pdf`

List PDFs are not a third keepsake layout.

HTML preview: `printMode=report&pdfReport={name}` (daily: `printMode=daily&pdfDay={n}`).

Staging Style two PDF (`/api/pdf/shared/{token}/report/style-2`) 302s to the staging `Ae()` print preview. It does not 302 to travel.
