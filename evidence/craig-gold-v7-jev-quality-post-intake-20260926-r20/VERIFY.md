# Verification table

Pack `craig-gold-v7-jev-quality-post-intake-20260926-r20`.

Drive build, tip, and live `/api/version` are `81d853c764095b05d8d4477f3186549ca28441fa`.

Dialog cover and journey page 1 print `build used vs tip: 81d853c764095b05d8d4477f3186549ca28441fa equals the tip`.

Every journey PDF page, including EULA pages 5 and 6, prints the words `Capture build`. The voice-note shot is PDF page 18. Cover and contents are PDF pages 1 and 2.

JSONL header `sessionToken` is null. The exposed r19 owner-session token was rotated on staging before this drive. This pack does not contain that token.

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` and `scripts/screenshot_journey_pdf.py` were committed in `81d853c764095b05d8d4477f3186549ca28441fa` before either PDF was rendered. The render used that committed code. The journey script counted 78 screenshot pages, 10 gaps, and 33 of 36 feature files. The gap list below is the record of what was not captured. 33 of 36 is not full coverage.

jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.

Search and the autonomy bar were removed from the Feature Map by Craig's ruling (SoT jev-note-and-feature-map-gaps-20260927). This journey records them as N/A and does not rebuild either screen.

Trip View is removed from the app bundle.

Blank-image rejection dropped the purchase-email shot and the three collaborator-invite shots. Those pages were not published.

### Not captured

- Purchase email (`post-purchase-email-eula.md`): blank capture rejected for purchase-email
- Search (`search-redesign.md`): N/A. Search was removed from the Feature Map by Craig's ruling (SoT jev-note-and-feature-map-gaps-20260927). This journey does not rebuild it.
- Autonomy (`autonomous-app-customer-flow.md`): N/A. The autonomy bar was removed from the Feature Map by Craig's ruling (SoT jev-note-and-feature-map-gaps-20260927). This journey does not rebuild it.
- Ten lowest car prices (`car-fields.md`): GAP: no live rental price source is available within the allowed tools. There is no Kayak or other rental feed, Google Places is not allowed, and lowestCarOffers only lists places that already have a numeric price. The only car Thing here is SpeediShuttle, which has no price. Removing that one unpriced row leaves an empty list, so this journey does not publish an empty list as brand removal.
- Ratings and reviews (`ratings-reviews.md`): GAP: no sourced rating digit was on screen. The bundle renders those labels only when the stored string contains a digit. No rating was invented.
- Print and PDF (`print-pdf.md`): The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsake Style one (`keepsake-style-one.md`): style=1 did not stay on vacation-staging
- Kimberly collaborator invite (`collaborators.md`): blank capture rejected for email-kimberly
- Tyler collaborator invite (`collaborators.md`): blank capture rejected for email-tyler
- Lauren collaborator invite (`collaborators.md`): blank capture rejected for email-lauren

## What the published pages show

- PDF pages 10–12 are the Kimberly, Tyler, and Lauren welcome crops. The text is on the images. They are short chat crops (736×136, 736×113, 736×227), not full chat pages.
- PDF page 51 is SpeediShuttle under Cars, with no price and no Remove click.
- PDF page 52 is the Ulu Ocean Grill happy-hour field as stored. The page note adds no clock time.
- PDF page 53 is the Keepsakes menu, 760×300, with Style one and Style two.
- PDF page 54 is the separate-session keepsake URL. The image is a sign-in wall (`data-owner-session` is 0). It is mostly empty.
- PDF page 56 is Keepsake Style two on the intake trip.
- Day shots are 1280×581. The day-map shot is the map under Vacation Day View.

## r19 record this pack replaces

r19 dialog PDF creation time is 2026-09-27 21:46:47 UTC (11:46:47 HST). r19 journey PDF creation time is 2026-09-27 21:50:56 UTC (11:50:56 HST). The r19 evidence commit `a45a9257232a192752c977afffe1a0918a1573a2` is 2026-09-27 21:53:07 UTC (11:53:07 HST). Those PDFs were rendered before that commit. The r19 REPORT's claims that pages 8–10 are chat bubbles, that pages 55–56 show Print/PDF and Keepsakes, that page 54 shows Ulu 3–6 PM, that every page is stamped, and that 35 of 36 features were captured, are false.
