Closes #546

## Summary

List rows show long sourced `places[]` / ccab copy (≥30 words), not short day-assignment blurbs. Hotels, cars and experiences use `tsListRowDescription` in the served TREK bundle.

This round (start `d0dbedfd`, Gate B round 22) clears the three checks this PR caused against base vk `6e88120`: feature parity (Cars list empty on cars-390-top), logo lost vs staging, and generic logos.

## Changes (this round)

- **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: non-hotel list rows now use vk's existing hotel row clamp (3 lines when the text is ≥30 words). Before this, the unclamped car row was 696 px tall, so the list-only Priceline row was the only row on cars-390-top. Pages at 390 px were 1.4–3.6× taller than staging (cars 5205 vs 1450 px).
- **`src/vacation/thing-logo-ink-center.mjs`**: the `dc()` row logo `<img>` is now `loading:"eager"` (it was `lazy`). Logos below about y≈3800 were never requested, so rows lower down showed the placeholder chip (the logo-lost and generic-logo checks).
- **`public/assets/index-BKun7ofk.js`**: rebaked via `node scripts/rebake_served_trek_bundle.mjs`.

The brief's hunch about the bea63495 logo-URL replay did not hold. The served fixture's car `logoUrl` is the same on vk and on this head.

## Verification (local)

- Gate B structure replay: `vite build`, then `serve-preview.sh`, then `~/tsv-dispatch/capture/capture.mjs` on fixture `heads/d0dbedf….json`, then `restore_check.check_dir` against `staging-6e88120-fixture-f43fbc6f7bcce741` with recorded receipts. Feature parity, logo lost and generic logos are gone. Description verdicts are unchanged.
- `node scripts/test_served_trek_bundle.mjs`, `node scripts/test_list_row_description_substance.mjs`, `node scripts/test_hotel_list_desc_capture_leaf.mjs`, every script in `scripts/offline-tests.txt`, `cd apps/vacation-client && npm test`, `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`. Results are in `J/RECEIPT.md`.

## Left alone (scope)

- **Description quality** (events 8/15, flights 5/10, restaurants 4/25, stores 9/15) is still failing. The weak rows have thin fixture data: no address, dish, set time or return fare. That is a DATA fault under `vk-thing-data-contract`, and the UI cannot fix it without inventing text.
- **Known base gaps** (budget complete, centred logos, row layout) are untouched. Centred logos now also lists cars-1280 (1.5 px, sub-pixel row pitch). That is the same base-gap check.
- No baseline, threshold, fixture, test or Gate B edits. No merge of `vk`.
