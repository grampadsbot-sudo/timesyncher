# PR #907 / #903 — stale provenance title assertion (head `db729549`)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `db729549e344aeabe1e758ec3818b7a9228dd3d0` (verified before editing).

## Root cause

CI unit-tests red on `db729549` at `scripts/test_pr336_ccab_search_provenance.mjs:24`: the test still pinned the pre-#903 stored title `'Priceline opaque Standard sedan'` for row 609. On this PR the stored source row in `scripts/fixtures/nyc-craig-kim-daybyday-rows.mjs` (and the regenerated snapshot) reads `'Priceline Express Deal (car company shown after booking) Standard sedan'`, and `identityProvenance.approvedDisplayTitle` follows it. The data is right; the test asserted stale data. The earlier round (receipt for `e6a44caf`) missed it because its full offline run stopped at the first, environment-only failure.

## Fix

| file | change |
| --- | --- |
| `scripts/test_pr336_ccab_search_provenance.mjs` | Row 609 assertion now reads the stored row from `buildNycCraigKimDaybydayFixtureRows()`, pins its stored name, and asserts `approvedDisplayTitle` and built `title` both equal that stored name. Same check, bound to the single source of truth instead of a stale literal; nothing loosened. |

No product, fixture, snapshot or check-config change in this round.

## TARGET D (alias)

`GATE_B_DISPLAY_TITLE_ALIASES[609]` kept. Without it, `assertGateBRowProvenance` (`scripts/fixtures/pr336-vk-search-trip-sources.mjs`, non-flight branch) throws `row 609: title Priceline Express Deal (car company shown after booking) Standard sedan does not match ccab key Priceline opaque JFK — Standard sedan`: `resolveNycCcabKey(name)` returns the name unchanged and the 12-char prefixes differ (`priceline ex` vs `priceline op`).

## TARGET E (all snapshot rows bind)

`node scripts/build_gateb_canonical_shared_trip.mjs <job>/canonical.json`, then `node <job>/bind-check.mjs <job>/canonical.json scripts/fixtures/pr336-vk-search-places.snapshot.json`: **all 94 rows match** (start `db729549`). Values unchanged: 609 rentalCompany `Priceline Express Deal (car company shown after booking)`; 630 07:25–16:35, 631 11:30–22:25, 632 05:05–15:45, 633 06:30–16:55, 634 06:50–18:55 (title `Business Select® upgrade (Southwest LAS → LGA)`).

Leftover grep (`Express Deal|hidden-brand|retitleFlightUpsell|SOUTHWEST_LGA_ARRIVAL_BY_ROW|row.id === 609` in `live-qa-903-presentation.mjs` and `nyc-craig-kim-daybyday-trip.mjs`): no matches at `db729549`.

## Checks (worktree at start `db729549` + this patch)

| check | result |
| --- | --- |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | FAIL before patch (same assertion as CI), PASS after |
| `cd apps/vacation-client && npm test` | PASS (rewritten `evidence/*.png` restored) |
| every script in `scripts/offline-tests.txt` (439, job-dir `run-all-offline.mjs`, no stop-at-first) | 438 PASS, 1 FAIL `scripts/test_live_transcript_dialog_pdf.mjs:861` `layout.status` null: `pdftotext` not installed on this host (environment only; file not in PR diff) |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | ok, 94 places, snapshot byte-identical (no git diff) |
| `node scripts/check-no-comments.mjs` | PASS (1134 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/vk_contract_check_local.mjs` | prints DATA-CONTRACT rows (e.g. 692–695 missing_rating/missing_sourced_reviews, 710 logo mismatch); none touched by this test-only diff; not compared against base here |

CI run id and Gate B verdict for the published head: not available from this lane (host publishes).

## Host publish

Uncommitted paths:

- `scripts/test_pr336_ccab_search_provenance.mjs`
- `J/RECEIPT.md`, `J/PR_DESCRIPTION.md`
