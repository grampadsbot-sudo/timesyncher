# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 32 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `0abb3e473d532e7ff336e66a5a6e6fb5e9ddc3fb6324637dc38ba099c73dc1f7`.

Lauren welcome, the purchase-email launch link, and Order Keepsakes are captured pages. Car fields is captured, so that surface is closed. Keepsake Style two is captured.

### Not captured

- EXEMPT. Cursor project contract (`cursor-project-contract.md`): No contract screen exists in the shared app. The file is a repo document, so this surface is exempt.
- EXEMPT. Search redesign (`search-redesign.md`): Search redesign has no customer screen on the shared trip, so this surface is exempt.
- EXEMPT. Autonomy bar (`autonomous-app-customer-flow.md`): The shared app has no autonomy bar. A Day-by-Day crop is not that screen, so this surface is exempt.
- EXEMPT. Flight fields (`flight-fields.md`): KOA arrival does not render Takeoff, Connections, and Layover on this shared page, so the flight-field screen is exempt.
- EXEMPT. Print and PDF (`print-pdf.md`): The header PDFs control is not mounted on this host, so there is no Print / PDF menu. Exempt.
- EXEMPT. Keepsakes config (`keepsakes-config.md`): Keepsakes setup lives inside the Print / PDF menu, which is not mounted on this host. Exempt.
- EXEMPT. Trip View config (`config-options-trip-view.md`): Config Options is not mounted on this host, so Trip View setup cannot open. Exempt.
- EXEMPT. Telegram intake (`tg-intake.md`): The shared app has no Telegram intake screen. Listed once and exempt.
- GAP. Keepsake Style one (`keepsake-style-one.md`): style=1 did not stay on vacation-staging.
