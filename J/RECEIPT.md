# PR #844 — cursor-ubuntu hard round tier 1 (2-check)

Start HEAD: `5ac276a24cafaf4c190f3ee9749d080dcf4b739c` (verified at launch).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-844`: **page_not_found** (noted per brief).

## Root cause (CI `scripts/test_stored_ccab_canonical_identity.mjs`)

`mergeStoredCcabNarrativeIntoOverride` bound the thin ccab key **Blue Note** (22-word `description`) before richer identity:

- `externalId: Blue Note Jazz Club` on thin overrides never reached 25 words (CI line 75).
- Alias rows with `bluenote.net` on the place and `bluenotejazz.com` on `sourceRecord.website` resolved via **place.website first**, keeping the 20-word **Blue Note** stub instead of **Blue Note Jazz Club** review copy (line 220).

Earlier Gate B rounds (eb295143, cc3ead70) did not address this because CI on head `5ac276a2` regressed on ccab substance, not the assignment double-finalize fix already on that head.

## Fix

| Path | Change |
| --- | --- |
| `src/vacation/stored-ccab-substance-text.mjs` | Pick longest ccab narrative (reviews / `websiteFlavour`) when canned `description` is under 25 words. |
| `src/vacation/stored-ccab-website-resolve.mjs` | Choose richest website-host ccab hit across all place/override URLs (not first host only). |
| `src/vacation/stored-ccab-narrative-merge.mjs` | Prefer richer website ccab over thin title hit; boost thin rows via `longDetails` while keeping pr336 `description` snapshot; emit ccab `price` on enrich. |
| `src/vacation/shared-trip-live-app-fields.mjs` | After ccab merge, copy `override.price` onto `place.price` when allowed. |

## Local proof (base `5ac276a2` + uncommitted patch)

| Command | Result |
| --- | --- |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | **PASS** (was: line 75 / 220) |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | PASS |
| `node scripts/test_car_brand_filter_scope.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (`stored-ccab-narrative-merge.mjs` 488 lines) |

## Gate B (chief dr — host re-capture required)

Prior failures: events/cars structure screens + list/budget DOM price segments (eb295143 / cc3ead70). Offline contracts above pass on `5ac276a2` + patch; **no Cursor structure capture** this pass. Host must publish, re-run CI, then Gate B `staging-structure-v6` on the new head.

## Host publish

Uncommitted patch on `fix/nyc-screen-t3018-3020` at base `5ac276a2`. Host: review → commit → push once → CI → Gate B on new head.
