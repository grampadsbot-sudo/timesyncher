# VK issue #589 receipt (cursor-ubuntu vkfill-589)

**Start sha:** `7bc66068db57e6afa646eec0ddbcf911b4f5f9ed`  
**Tip sha:** `0fd6dc78`

## Problem

Gate B structure on `migrate/trek-source` failed `logo not centred with name` for Events list rows (Apple Fifth Avenue, Bergdorf Goodman, Blue Note, …): `missing visible name line (fail closed)`. Capture records `first_text` only from a `span`/`strong` leaf inside `[data-ts-list-row-name]`; default `Oe()` rows used plain `ua` text in that span (no leaf), so `first_text` was null while the logo chip was measured.

## Fix

Wrap the default non-flight/car/hotel title in `<strong>` when building `Zn` in `src/vacation/shared-trip-oe-list-row-patch.mjs`; rebake `public/assets/index-BKun7ofk.js`. Assert in `scripts/test_itinerary_fresh_daybyday_bundle.mjs`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Product fix ready on branch `vkfill/589-20261021131734`; host publishes once; CI + Gate B on PR head are authority for close.

---

# TSV PR #598 Gate B fix-it (TSV #596)

**Start sha:** `375fdc067c9beca9fc65559d6a824a60d496866f`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-598` (initial automated fetch returned `page_not_found`; page exists via `gbrain get_page` with compiled handoff at 4:10 PM PT)

## Problem

- Gate B pixel compare flagged `daybyday-1280.png` (~0.034%): OSM map tile flake vs frozen `base-446e191` (handoff: harness/map, not list CSS).
- Remaining product gap: **Events (The Rest) at 390px** — long `Flight option:` rows (`tsv-row-flight-main`) kept `nowrap` names and extended past the viewport.

## Fix

- Consolidate mobile wrap into one `@media (max-width: 480px)` block; budget names use `.tsv-budget-line .tsv-budget-line-name` so base `nowrap` does not win.
- Add `[data-shared-live-tab='events'] .tsv-row-flight-main .tsv-row-name` mobile wrap (Flights tab keeps single-line flight names for ink/layout tests).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_vacation_client_list_row_390_text_wrap.mjs` | 0 |
| `node apps/vacation-client/test/list-layout.mjs` | 0 |
| Gate NYC fixture events @390 row box probe (no elements with `right > viewport`) | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Pushed to `cursor/tsv-596-vk-390px-descriptions-are-clipped-run-past-the-right-edge-hotels-the-rest-budget-8ccf`; CI + Gate B on new head are authority for close.
