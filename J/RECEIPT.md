# PR #650 / issue #644 — cursor-ubuntu vkfill-650 round (2026-10-23)

**Start sha:** `ba29d7f4e44bb7df4f24b6b0139cfbd92837f410`

## Outcome

Source-ready for host publication (commit + push). Not CI green, run10 live acceptance, or Gate B 32/32.

## Changes this round

- **`thing-dossier-fields.mjs`:** Description (and apply path) keeps the field when at least one cited claim is judge-supported; unsupported claims are dropped from the stored `claims` list instead of blanking the whole description (Village Vanguard / chief-dr §3).
- **Price parser** (`thing-evidence-price-estimate.mjs`): unchanged on start head; `scripts/test_thing_evidence_price_estimate.mjs` already covers literal `$`, decimals, year false positives, and typical-over-max.
- **`scripts/test_thing_evidence_dossier.mjs`:** Regression for mixed supported/unsupported description claims.

## Local verification (worktree `ba29d7f4` + uncommitted diff)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_thing_evidence_price_estimate.mjs` | pass |
| `node scripts/test_vk_search_place_output_contract.mjs` | pass |
| `node apps/vacation-client/test/detail.unit.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (851 files) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `gateBCapturePreDataCheck(scripts/fixtures/gate-b-nyc-shared-staging.json)` | pass (0 blank_price / hotel_description_judge) |

## Gate B failures named in brief (hotels/flights budget list prices, hotel description quality)

Not reproduced against repo fixture `scripts/fixtures/gate-b-nyc-shared-staging.json` at this head (pre-data check 0 failures). Those auto-round lines target live staging capture on build `ba29d7f4` / `745d594d`; fixing them here would require staging trip rebake or harness edits (out of scope: no fixture hard-code, no Gate B script edits).

## Uncommitted for host

- `src/vacation/thing-dossier-fields.mjs`
- `scripts/test_thing_evidence_dossier.mjs`
- `J/RECEIPT.md` (this section)

Host: single commit on `cursor/tsv-644-vk-price-estimate-built-from-each-thing-s-evidence-file-labelled-as-an-estimate-never-blo-ff9f`, push, CI, run10 semantic price acceptance.

---

# PR #650 / issue #644 — cursor-ubuntu vkfill-650 (2026-10-23)

**Start sha:** `745d594de0a21fa62274b169959de3036fa04135`

**Base merge:** host merged `origin/migrate/trek-source` at `39e5c83507f25a11c948b793301bfa8164a3dda3` into start head; conflict resolved in `src/vacation/thing-dossier-fields.mjs`.

## Outcome

Source-ready for host publication (merge commit + push). Not CI green, run10 live acceptance, or Gate B.

## Changes this round

- **`thing-dossier-fields.mjs`:** merge resolution keeps #643 hours/happy-hour field application (`HOURS_NOT_FOUND`, `NO_HAPPY_HOUR_FOUND`, `HAPPY_HOUR_SUBFIELDS`, review-set cite resolution from base) and #650 evidence-backed `buildPriceEstimateFromEvidence()` (numeric `price` only from estimate builder, not from dossier `fields.price` scalar loop).
- **Price parser** (`thing-evidence-price-estimate.mjs`): unchanged on start head; already requires literal `$`, decimal parsing, per-person/night/ticket context, typical-over-max preference, and unavailable when cited claim amount is absent from page text (see `scripts/test_thing_evidence_price_estimate.mjs`).

## Local verification (worktree at `745d594` + merge resolution)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/test_thing_evidence_price_estimate.mjs` | pass |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_dossier_hours_happy_hour.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (851 files) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| Full `scripts/offline-tests.txt` loop | **blocked:** `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` — no `google-chrome-stable` at `/usr/bin/google-chrome-stable` (env, not source) |

## Uncommitted for host

- Merge in progress: staged files from `migrate/trek-source` merge plus **resolved** `src/vacation/thing-dossier-fields.mjs` (host: `git add` conflict file, `git commit --no-edit`, then any rebake commit if bundle drift requires it).
- This receipt update (`J/RECEIPT.md`).

## Host-owned

Single push to `cursor/tsv-644-vk-price-estimate-built-from-each-thing-s-evidence-file-labelled-as-an-estimate-never-blo-ff9f`, CI, run10 price semantic acceptance, PR description refresh.

---

# Issue #641 — cursor-ubuntu vkfill-641 (2026-10-23)

**Start sha:** `5ee5bb95586ab1d588b3dba7d2d116054f0296b7`

## Outcome

Source-ready for host publication; uncommitted. Not a green-CI, live run10, or merge claim.

## Changes

### a) Review claims: `rN` → dossier `pN`

- `thing-dossier-fields.mjs`: `reviewSetPageIdMap`, `resolveClaimCitationPages`; `claimCitesKnownPages` resolves review-set ids via `dossier.reviewSet[].page`.
- `xai-grok-place-ratings.mjs`: `judgeDossierFindings` rewrites claim `pages` to resolved `pN` before the cite gate and judge. Unresolvable `r` ids still fail.

### b) Meaning-based judge

- `dossierJudgePrompt` (exported): summaries are not quotations; pass on meaning/paraphrase; fail on unsupported facts, wrong numbers/times/names, or contradictions.
- `scripts/test_thing_evidence_dossier.mjs`: review-set resolution + paraphrase path to judge + contradicted claim fail + prompt assertion.

### c) Brave coverage (round 5 findings)

**Investigation** (`~/run10-20261022/out5`, start `5ee5bb9` deploy): 9/10 Things had `brave` `local_search` `results: 0` then `match: no_match`; only Rosa Mexicano got locations + a Brave page (rating only, 0 embedded reviews). Harness `call5.py` passes `destination: New York` with **no lat/lng** on places, so dossier Brave never ran `place_search` until a center exists. Production VK rows from Brave place search carry coordinates on `sourceRecord` / `coordinates[]`, but `placeCoords` only read flat `lat`/`lng`.

**Fixes in code**

- `dossier-brave.mjs`: read coords via `bravePoint` (same as place search); `intakeLodgingLookupQuery(name, destination)` for Brave queries; `place_search` when place, trip `metadata.destinationCenter`, or search `center` is available; thread `center` from `gatherThingEvidence` / `fetchXaiPlaceRatings` / `place-search` enrich.

**Left alone:** Brave plan limits, Tavily dedup, and harness still lacking trip `destinationCenter` (host may pass center on dossier-run API for run10).

## Local verification (start `5ee5bb9` + uncommitted diff)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_dossier_round5.mjs` | pass |
| `node scripts/test_dossier_refresh_integration.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (847 files) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

## Host-owned

Commit, push once, open PR into `migrate/trek-source` with `Closes #641`, CI, run10 live acceptance, Gate B if required.
