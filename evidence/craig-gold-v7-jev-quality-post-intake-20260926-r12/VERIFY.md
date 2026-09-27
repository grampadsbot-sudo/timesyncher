# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 32 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `268633ea519713e9b388dc21b0f34073b1ec89a67f13880f42fa6a70db11edc8`.

### Not captured

- Tyler welcome (`collaborators.md`): the chat has no app bubble containing "Welcome aboard, Tyler"
- Cursor project contract (`cursor-project-contract.md`): No contract screen exists in the shared app. Unblock: a contract page on the shared trip.
- Search redesign (`search-redesign.md`): Search redesign has no customer screen on the shared trip. Unblock: a search box on the shared trip.
- Autonomy bar (`autonomous-app-customer-flow.md`): The shared app has no autonomy bar. Unblock: mount that bar on the shared trip.
- Car fields (`car-fields.md`): SpeediShuttle shows the shuttle summary and does not render Rental company and Car type. Unblock: those two fields on the open car detail.
- Print and PDF (`print-pdf.md`): The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config (`keepsakes-config.md`): Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.
- Order Keepsakes (`order-keepsakes.md`): Order Keepsakes did not open a panel of its own, so the shot would still be the thing page. Unblock: an order panel that replaces the thing page.
- Trip View config (`config-options-trip-view.md`): Config Options did not open Trip View. Unblock: mount Config Options with Flights, Hotels, and Cars on this host.
- Telegram intake (`tg-intake.md`): The shared app has no Telegram intake screen. Unblock: a Telegram intake view on the shared trip.
