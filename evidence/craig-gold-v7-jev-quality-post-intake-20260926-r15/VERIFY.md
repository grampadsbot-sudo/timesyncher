# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 33 of 36.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `52523b56b3f7c1867c8da29aca744902dc00078764f6755f0261f031a9f8f19d`.

### Not captured

- Ratings and reviews (`ratings-reviews.md`): no sourced rating screenshot was captured
- Print and PDF (`print-pdf.md`): The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config (`keepsakes-config.md`): Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.
