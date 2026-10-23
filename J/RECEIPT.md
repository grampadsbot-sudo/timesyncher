# PR #660 fix-it — Gate B tab capture (2026-10-23)

GBrain handoff page `bot-admin/lanes/vk-pr-handoff/pr-660` was not found at session start (`page_not_found`).

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
