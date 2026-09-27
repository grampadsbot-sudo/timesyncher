# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

A feature file counts as captured only when a journey PDF page lists that file.
Captured feature files: 35 of 36.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `7e0dc018ff8c52941fcbcb049053372107d0972bed67d470f07ebcb5c6434924`.
Autonomy stays a system test: features/autonomous-app-customer-flow.md and bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910. It is not a screen in this journey.
Trip View is removed from the app bundle. The chat box is the search.

### Not captured

- Chat search: The chat did not ask add these? Autonomy stays the system test in features/autonomous-app-customer-flow.md.
- Ratings and reviews (`ratings-reviews.md`): no sourced rating screenshot was captured
