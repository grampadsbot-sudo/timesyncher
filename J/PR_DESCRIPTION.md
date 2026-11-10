Closes #903

## #907 conflict round (cb4638cf + vk @ 85fae5b3)

Resolved merge conflicts in `J/RECEIPT.md` and `scripts/offline-tests.txt` (kept **both** `test_issue_903_live_qa_polish` and `test_issue_901_trip99_single_venue_standins`). Ran `node scripts/rebake_served_trek_bundle.mjs`. Pre-DONE gates in `J/RECEIPT.md` all PASS locally.

#903 product remains: `live-qa-903-presentation.mjs` + `trek-qa-903-ui-patch.mjs` (7 live-QA polish checkers); #832 flight titles preserved for non-Southwest stored names.

---

Closes #901

## Summary

Replaced three trip 99 stand-in bundle Things with single real venues in the PR336 snapshot and Gate B NYC staging fixture, using VK Search dossiers (664→Big Apple Greeter, 669→Birdland Jazz Club, 672→e’s BAR). Added a trip 99 stand-in checker (multi-venue ` / ` titles, legacy generic walking-tours title, street-address guard for ids 664/669/672) wired into capture pre-data check, with offline regression tests.

## Round vkfill-901-20261109183250 (start 3e710445): unit-tests fix

CI `unit-tests` on 3e710445 failed in `scripts/test_gate_b_live_replay_display_facts.mjs`: `served: place 664 price must match hosted (65 !== 25)`. The next row would have failed too: `externalId` for 664 and 669.

Root cause: the PR changed the Gate B served fixture for 664/669/672 but left the hosted live replay (`nyc-screen-trip99-live-shared-api.json`) on the old bundle rows. The earlier ccab fix (Big Apple Greeter `price` 0 → null) also lets the standard category estimator (`src/vacation/search-place-price-estimate.mjs:62`, activity = 65) price 664 in the served build.

Changes (data only, no code):
- `scripts/fixtures/nyc-screen-trip99-live-shared-api.json`: trip 99 post-image for 664/669/672 (name/title, street address, lat/lng, website/url, price, reservation titles; stale bundle `externalId`/`ccabKey` removed). This follows the #889 pattern (68a2369e) of editing the hosted replay to the planned live state.
- `scripts/fixtures/gate-b-nyc-shared-staging.json` and `scripts/fixtures/pr336-vk-search-places.snapshot.json`: 664 `price: 0` (a banned `$0` value) → 65, the same value the served build computes.
- `J/trip99-change.sql`: 664 `price = 65` (was banned `0`), plus `reservations` titles 1464/1469/1472. `J/trip99-backup.sql` backs up those reservations.
- New `J/trip99-change.json`: the matching `thingOverrides` edits. Live keeps the bundle titles in overrides, so the places-only SQL would not change `/api/shared`. `J/REVERT.md` is updated to match.

Why 65 and not "free": the dossier (`vk-search-census/results/664.json` `priceHint`) says "Free (tips not accepted)". But `$0` is a banned contract value, and the positive Gate B contract (`scripts/lib/gate-b-nyc-fixture-contract.mjs:103`) needs a price on every Thing. I tried a missing-price flag and that contract rejected it. So 664 carries the standard estimator value. This needs a managing-dr ruling on how to show free Things.

## Test plan

- [x] `node scripts/test_gate_b_live_replay_display_facts.mjs`: passed
- [x] full `scripts/offline-tests.txt` loop (see J/RECEIPT.md)
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`
- [ ] CI on PR head
- [ ] Gate B structure on the pushed head (664 now shows $65 instead of $0 in the staging fixture)
- [ ] Host: apply `J/trip99-change.sql` + `J/trip99-change.json` with backups, re-run fill for 664/669/672, then re-pull the hosted replay

## Left alone (scope)

- Live override narratives for 664/669/672 (summary, itineraryNote, longDetails, details, reviews) still describe the bundles. They come from the host dossier re-fill and are not predicted here.
- The `thingOverrides` storage table was not found in this repo.
- Other candidate-bundle rows, #889 addresses, #887, #903.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
