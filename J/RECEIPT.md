# #901 / PR #908 — trip 99 stand-in bundle Things → single venues (+ vk base merge)

**Outcome:** source-ready PATCH (uncommitted; host publication). **Start HEAD:** `9913e4604884694d8eda4a07cd66f7f2ce31b7eb`.

## Changes

| id | was | now |
| --- | --- | --- |
| 664 | Guided walking/audio history tours (neighborhood address) | **Big Apple Greeter**, 1 Centre Street, New York, NY 10007 |
| 669 | Village Vanguard / Smoke / Birdland / Jazz Gallery (bundle title) | **Birdland Jazz Club**, 315 W 44th St, New York, NY 10036 |
| 672 | e's BAR / The Dead Poet / Lilly's Cocktail & Wine (bundle title) | **e's BAR**, 511 Amsterdam Ave, New York, NY 10024 |

**CI fix (unit-tests):** `nyc_ccab_place_enrichment.json` — Big Apple Greeter `price` `0` → `null` (free program; `test_gate_b_product_row_fields.mjs` requires positive price only when `price != null`).

**Host vk merge (`d9b60879` into `9913e460`):** Resolved conflicts keeping #901 single-venue rows (664/669/672) and vk #889 dossier/address overlay code paths from merged tree (already staged non-fixture sources).

### Files (this round)

- `scripts/fixtures/nyc_ccab_place_enrichment.json` (merge + price null)
- `scripts/fixtures/gate-b-nyc-shared-staging.json` (merge: #901 titles/addresses)
- `scripts/fixtures/pr336-vk-search-places.snapshot.json` (merge: #901 titles)
- `J/RECEIPT.md`

## Checks (this lane)

| Check | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

1. Complete merge commit after conflict resolution in four files.
2. `git add` changed paths; push once to `vkfill/901-20261109163211`.
3. Apply `J/trip99-change.sql` on Neon if not already applied (host).
4. CI + Gate B on new head.

## Left alone (scope)

- `gate-b-nyc` place `price: 0` on free Greeter trip row (budget semantics); ccab enrichment uses `null`.
- Baselines, offline-tests.txt, workflows, rebake unless host requires served bundle refresh.
