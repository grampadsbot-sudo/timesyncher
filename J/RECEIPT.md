# PR 653 vkfill-653 round — review breadth + Zabar's description (host publish)

Start HEAD `147d91d997373c23330a5ae2747f5456ea180707` (verified). Handoff `bot-admin/lanes/vk-pr-handoff/pr-653` 2026-10-23 5:20 AM PT.

## Root cause (reviews 6/10 → 4/10 on `021b6867`)

`finalizeReviewSet` dropped code-extracted reviews whenever the xAI extract step returned a `keep` list that omitted their candidate ids. Non-Reddit aggregator pages (Yelp, TripAdvisor, Booking, Trustpilot, etc.) were removed even when grounded on the saved page, collapsing `reviewSources` to one host while `reviewsRead` stayed high.

## What changed (on `147d91d` + lane fix)

- `src/vacation/dossier-review-extract.mjs`: keep grounded reviews from review-aggregator hosts when `keep` omits them; JSON-LD `description` on aggregator pages; `incredible` in opinion detector; `reviewAggregatorHost` helper.
- `src/vacation/thing-evidence-dossier.mjs`: Tavily topics `trustpilot reviews` and `opentable OR resy reviews`.
- `src/vacation/thing-evidence-dossier-execution.mjs`: pass `target.center` and place coords into `fetchXaiPlaceRatings` for Brave `place_search` (no hardcoded coords in `src/` — HC-COORD).
- `scripts/fixtures/pr336-gate-b-xai-place-targets.mjs`: `PR336_NYC_TRIP_CENTER` + `center` on each staging target.
- `src/vacation/xai-grok-place-ratings.mjs`: after judge, repair description from **supported-only** claims (Zabar's path) via `repairDescriptionFromSupportedClaims`; widen extract candidate cap to 90.
- `scripts/test_thing_evidence_dossier.mjs`: regressions for aggregator keep + description repair.

No Gate B, capture, fixture-replay, bundle, or Flights/Hotels UI changes.

## Uncommitted files (host commit once)

```
scripts/fixtures/pr336-gate-b-xai-place-targets.mjs
src/vacation/thing-evidence-dossier-execution.mjs
```

(Prior round already committed the other dossier files at `147d91d`.)

## Checks run (workspace @ `147d91d` + above diff)

| Check | Result |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | PASS |
| `node scripts/test_thing_evidence_dossier.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (291 offline) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_check_hardcoded_content.mjs` | PASS (after HC-COORD fix) |
| `node scripts/run-offline-tests.mjs` | PASS through manifest; `test_day_by_day_map_marker_bounds_chrome.mjs` throws (no Chrome at `/usr/bin/google-chrome-stable` in this lane — env, not PR diff) |

Not claimed: CI, Gate B 32/32, run10 acceptance (DESC/REV 10/10), merge.

## Left alone (per handoff)

Flight/hotel list prices, hotel description quality scores — #659. Gate B capture/check edits.
