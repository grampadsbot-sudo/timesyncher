# PR #970 round — vkfill-970 tier-1 (composer-2.5, cursor-ubuntu)

Outcome: **source-ready** for host publication from starting HEAD `a42768b60791ef8337785c7386881e2281e95f7d`. Not CI-green until host publishes; Gate B not re-run locally on this pass.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-970`: **not found** on this pass (per brief).

## Root cause (why round 2 CI still red)

`scripts/test_shared_tab_list_summary.mjs` eval-harness for `Oe()` was not updated when #968 landed `patchListRowDates` / travel-list header v3 in `public/assets/index-BKun7ofk.js`:

1. **ReferenceError `Ar is not defined`**: hotel rows call `Ar(G)` / `hn(G)` inside `tsListDateRange({...})` but the harness env omitted those stubs (same gap fixed earlier in `test_shared_hotels_390_text_wrap.mjs`).
2. **Stale bundle/row assertions**: price moved to `[data-ts-list-price]` with `$X / night` suffix; old regex expected inline `children:ie(G)` on the legacy header.

Product bundle + `list-row-dates.mjs` on `a42768b6` are unchanged; this round only aligns the offline harness with the served contract.

## Source changes (uncommitted)

| File | Why |
| --- | --- |
| `scripts/test_shared_tab_list_summary.mjs` | Stub `Ar`/`hn`/`la`/`Qa`/`Yi`/`tsStarRatingAria`/`tsFltLegTz`/`Ne`/`lc`; assert `data-ts-travel-list-header` + `data-ts-list-price`; hotel row price expects `$1,234 / night`. |

## Checks (local, starting HEAD `a42768b6`)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_tab_list_summary.mjs` | exit 0 (was `ReferenceError: Ar is not defined`) |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | exit 0 |
| `node scripts/test_served_star_rating_bundle.mjs` | exit 0 |
| `node scripts/test_budget_required_price_completeness.mjs` | exit 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `npm run test:keepsake-style2` | exit 0 |

Pre-DONE gates above pass on dirty tree. No commit, stage, push, merge, rebase or deploy (HOST PUBLICATION ONLY).

## Gate B / budget (left for host)

- Hermes run `20261112-220558` on head `a42768b6`: **pixel FAIL** vs NYC reference (not approved baseline); `-top` ratio ~0.09–0.19; full-page **width drift** (baseline 1340 vs candidate 1280). Intentional #968 travel-list layout shift; structure JSON on candidates shows list prices present on hotels capture (`~/tsv-gateb/runs/20261112-220558/v6/_v6-hotels-390.json`).
- Chief-dr budget **missing-price** / **hotel description quality** lines: fixture checks (`gate-b-budget-price-completeness`, `test_nyc_budget_search_fill_prices.mjs`) **pass** locally on `a42768b6`; live capture failures may reflect staging fixture/data or managing-dr verdict gaps — not addressed in this harness-only patch.

## Host next

One ff push to `vkfill/968-20261112114229`, wait for CI (`unit-tests` must include `scripts/test_shared_tab_list_summary.mjs`). Re-run Gate B structure mode vs staging after publish.
