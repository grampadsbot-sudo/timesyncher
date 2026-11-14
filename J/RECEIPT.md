# TSV #969 / PR #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `fd4d3a36d128aec704d5651d2e50fea0695a1e0f` (verified `git rev-parse HEAD` before edit)

## Root cause (CI `accept` on prior tip; empty assertion list on fd4d3a36 launch)

Travel-list header (`patchListRowDates`) moved flight/car fare to `data-ts-list-price="1"` without `data-ts-flight-price`, so `scripts/test_issue_959_owner_pencil_webkit.mjs` could not find fare nodes at 390/430. Detail v3 view Summary used a non-`h3` readonly block, so section order checks saw `ADDRESS` before `SUMMARY`.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/list-row-dates.mjs` | Mirror `data-ts-flight-price="1"` on travel-list fare span for accept selector parity. |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Tag legacy `Qo` fare span with `data-ts-flight-price` when QoRest path is unused. |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | Render Summary through standard `field('summary')` so `h3` section order matches #969 acceptance. |
| `src/vacation/trek-ui-734-round2-patch.mjs` | #734 round2 idempotency checks accept v3 summary section markers. |
| `public/assets/index-BKun7ofk.js` | Rebaked served bundle (`node scripts/rebake_served_trek_bundle.mjs`). |
| `scripts/test_issue_959_owner_pencil_webkit.mjs` | Read car fare from `data-ts-list-price`; happy-hour assert matches contact-strip DOM. |
| `scripts/test_shared_tab_list_summary.mjs` | Bundle needle includes dual price markers. |
| `scripts/test_ui_734_round2_punchlist.mjs` | Detail v3 summary uses unified `field('summary')` in served bundle. |

## Local verification (starting HEAD `fd4d3a36`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_dossier_staging_fixes_682.mjs` | pass |
| `node scripts/test_ui_734_round2_punchlist.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_issue_959_flight_row_detail_price.mjs` | pass |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_served_star_rating_bundle.mjs` | pass |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` | pass (390/430 WebKit) |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |

No git stage/commit/push in lane.

## Host next steps

Stage all paths above → commit → push `vkfill/969-20261112114227` → wait for CI (`unit-tests`, `accept`, `secrets`, `gateb`) on new tip.