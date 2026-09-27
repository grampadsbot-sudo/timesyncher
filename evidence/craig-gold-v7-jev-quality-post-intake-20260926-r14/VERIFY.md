# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 31 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `6139aa10fe14b5d164a7814eb78636bb76c6a20f761dbfcea587a3ba3a1841ba`.

### Not captured

- Cursor project contract (`cursor-project-contract.md`): No contract screen exists in the shared app. Unblock: a contract page on the shared trip.
- Search redesign (`search-redesign.md`): Search redesign has no customer screen on the shared trip. Unblock: a search box on the shared trip.
- Autonomy bar (`autonomous-app-customer-flow.md`): The shared app has no autonomy bar. Unblock: mount that bar on the shared trip.
- Car fields (`car-fields.md`): SpeediShuttle shows the shuttle summary and does not render Rental company and Car type. Unblock: those two fields on the open car detail.
- Ratings and reviews (`ratings-reviews.md`): no sourced rating screenshot was captured
- Print and PDF (`print-pdf.md`): The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config (`keepsakes-config.md`): Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.
- Order Keepsakes (`order-keepsakes.md`): Order Keepsakes did not open a panel of its own, so the shot would still be the thing page. Unblock: an order panel that replaces the thing page.
- Trip View config (`config-options-trip-view.md`): Config Options did not open Trip View. Unblock: mount Config Options with Flights, Hotels, and Cars on this host.
- Telegram intake (`tg-intake.md`): The shared app has no Telegram intake screen. Unblock: a Telegram intake view on the shared trip.
