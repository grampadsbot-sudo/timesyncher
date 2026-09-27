# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 33 of 36.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `ceaee93f3d33ce9781518758e220cdca031f5e92ae5174c76d988c4a321f5f68`.

### Not captured

- Ratings and reviews (`ratings-reviews.md`): no sourced rating screenshot was captured
- Print and PDF (`print-pdf.md`): The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config (`keepsakes-config.md`): Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.

## Dialog content checks

- FAIL. post_intake_itinerary_collab_upsell. The intake reply says "I'll build the itinerary" and includes view access, edit access, the email invite, and unlimited vacations for the whole year. The check looks for "building the itinerary" or "building your itinerary". The PDF was still written.
