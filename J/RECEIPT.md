# PR #844 — cursor-ubuntu hard round (tier 1)

Start HEAD: `d05a70c878ceaa98409c7f7dcf05300a70d8454e` (verified at launch).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-844`: **page_not_found** (noted per brief).

## Root cause (CI `scripts/test_gate_b_product_row_fields.mjs`)

`buildNycCraigKimDaybydayTripPositiveV1()` already runs `finalizeServedSharedTripPayload()`. A second finalize must be idempotent: `gateBNycFixturePayloadSha256` hashes **assignments** as well as `thingOverrides`.

On re-entry, `applyThingPresentation()` clears top-level `place.description` (by design). `syncAssignmentPlaceSnapshots()` then merged the catalog place onto each assignment `row.place`, **overwriting** embedded `description` / `notes` / `summary` with empty strings. That changed the fixture digest (`8c4171d6…` vs `5ce58daa…`) and failed:

`candidate and base paths must hash the same finalized payload`.

Earlier rounds (eb295143, cc3ead70) did not land this because the failure is assignment-snapshot clobber on **double** finalize, not first-pass NYC UI work.

## Fix

| Path | Change |
| --- | --- |
| `src/vacation/shared-trip-flight-merge.mjs` | In `syncAssignmentPlaceSnapshots()`, after merging catalog onto `row.place`, restore `description`, `notes`, and `summary` from the prior embedded snapshot when the catalog field is blank. |

## Local proof (repo `d05a70c8` + uncommitted patch)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | **PASS** (was: digest mismatch at line 294) |
| `node --input-type=module -e "… finalize twice … idempotent …"` | **PASS** (`gateBNycFixturePayloadSha256` equal) |
| `node scripts/test_car_brand_filter_scope.mjs` | PASS |
| `node scripts/test_budget_required_price_completeness.mjs` | PASS |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS (warn: stale per-head Gate B JSON) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

`gateBBudgetPriceCompleteness` on `finalizeServedSharedTripPayload(nyc-screen-trip99 fixture)`: **pass true** (local; not Gate B structure/screens).

## Gate B (chief dr failures — not re-certified this round)

Prior head failures listed events/cars structure screens and budget DOM price segments (eb295143 / cc3ead70). **No Cursor Gate B structure run** on this agent pass; host must re-capture after publish. Budget row math on NYC fixture shows `hasPrice: true` for named Delta/JetBlue/Southwest/Manhattan Club rows at `d05a70c8` + patch (local model only).

## Host publish

Uncommitted patch on `fix/nyc-screen-t3018-3020` at base `d05a70c8`. Host: review → commit → push once → CI → Gate B structure on new head.
