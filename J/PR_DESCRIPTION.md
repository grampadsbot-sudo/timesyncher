Closes #888

## Summary

#888 layout fixes: conflict badges and trip switcher wrap (no ellipsis); flight time chips show full arrival/depart text; dates render as `Jun 23–30, 2026`; one font weight on chips.

**flights @390 (Defects A+B on `46172253`):** In `apps/vacation-client/src/styles.css` `@media (max-width: 480px)`, restored multi-row `.tsv-row-flight-main` (removed single-row five-column grid and logo-chip `margin-top`) so arrival times stay inside the card and airline logo chips match base `1ffd23c`.

**Host vk merge @ `86d90ed1`:** Staged index also carries vk slices (#927 hero/splitter, budget price parity, etc.); this round only resolved `J/RECEIPT.md` conflict. See `J/RECEIPT.md` for full check table.

## Test plan

- [x] `node scripts/test_issue_888_clipped_text.mjs`
- [x] `cd apps/vacation-client && npm test` (incl. list-layout @390/1280 Flights)
- [x] `node scripts/test_reply_action_claim_d2_paia_save_route.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`, `node scripts/check-hardcoded-content.mjs`
- [ ] CI on published merge commit
- [ ] Gate B structure with `gateb-allow.json["888"]` (pins + flights-390 rows/chips)

## Scope left alone

Baselines, Gate B config/allowlists, fixtures/NYC data, trek bundle (no asset conflict this merge), #884/#882/#889/#865.
