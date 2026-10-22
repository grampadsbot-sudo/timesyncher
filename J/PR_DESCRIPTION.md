Closes #595

## What changed

**Gate B coverage — budget dedupe + flight row titles (round 11)** — Trek budget `Mo` kept unpriced assignment copies over priced catalog rows; serve path now syncs assignment `place` snapshots from catalog and trek prefers `hasPrice` when deduping `Mo`. Flight list rows use full `mr(G)` titles so `gateb_coverage` name segments match fixture flight names. Canonical NYC capture names (incl. Romer apostrophe) from `nyc-vk-list-tab-rows.mjs`.

**Gate B coverage — blank override prices (`92eda194`)** — Upstream `thingOverrides` sometimes carry `price: ""`, which made trek `bi()` return empty and hid Flights list + Budget amounts even when `place.price` was filled on serve. Strip blank override prices before bind, refresh zero `budget` API lines from computed F/H/C totals, and patch served trek `bi()` to fall through empty overrides to `place.price`.

**BASE-MERGE (`cf1aaf21` + merge commit)** — Host merged `origin/migrate/trek-source` at `fb95a6306b16ea71cfc1adc6fc76a5779ec47403` into `cf1aaf21416c23c70823020c430bc77620baf374` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE round 5). Resolved conflicts in `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` only; took base `public/assets/*.js` then `node scripts/rebake_served_trek_bundle.mjs` (base #614 hotel 390px ellipsis + #621 pr336 snapshot key guard).

**BASE-MERGE (`b1c7e5b4` + merge commit)** — Host merged `origin/migrate/trek-source` at `6800a3b34e9a9773734f52e1526326b3961d463b` into `b1c7e5b4b8250a2447a8aee377d449bd0f09d5cf` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE round 4). Resolved conflicts in `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` only; brought base #621 pr336 snapshot key guard (`Motto` row id 676, `test_pr336_vk_search_places_snapshot_keys.mjs`).

**Gate B coverage — F/H/C list + Budget prices** — `applyThingDetailOverrides` runs `bindTravelListRowPrice` after detail merge so flights/hotels/cars keep estimated prices through `prepareSharedTripForLiveApp` and `syncSharedTripApiBudget`. Serve-path bind stays unconditional for F/H/C when no sourced price (restores API budget + small Gate B fixtures). Client `numericPrice` / `budgetModel` use the same estimate fallback (incl. `nightlyRate`) on served VK trips.

**Data fill (issue #595)** — Hotel descriptions from xAI grok fields + stored NYC CCAB enrichment on list rows (`xai-sourced-hotel-description.mjs`, fixture replay, live serve merge).

**Gate B fix-it (daybyday-1280 @ 0.03%, run `20261021-230524`)** — CCAB merge was copying `longDetails` / `summary` onto **timeline-selected non-hotel** overrides. Day-by-Day renders `rowSummary()` for `kind === 'thing'`, so subtitles appeared vs baseline. **Fix (7ccc8481):** bind override narrative (`longDetails`, price, logo, full `sourceRecord`) only for **hotels** and **list-only** rows; timeline non-hotels only upgrade `place.description` when thin/generic.

**CI fix-it — API budget lines (`5defdcb8`)** — Estimated F/H/C prices on `prepareSharedTripForLiveApp` updated **`scripts/test_shared_trip_api_budget_lines.mjs`** Gate B scrape fixtures (no more `$0` hotel rows).

**CI fix-it — shared tab list summary (`a4600d9f`)** — `bindHotelListSummary` was promoting the Manhattan Club CCAB card onto **PR225** `Midtown sample hotel` (title alias match), replacing the intake **“Strong transit access…”** summary. **Fix:** skip CCAB merge when the place already has a non-fixture intake `summary`; keep existing short summaries in `bindHotelListSummary`; do not rewrite `stored_fixture_literal` CCAB hotel copy in `composeSourcedHotelDescriptionFromRecord`.

## Verification (local)

| Command | Result |
| --- | --- |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

## Notes

- GBrain handoff via agent brief (`bot-admin/lanes/vk-pr-handoff/pr-599`).
- Baselines, capture scripts, workflows, and allowlists untouched.
- Gate B Ubuntu coverage not self-certified; host push + capture is authority.
