# PR 653 vkfill-653 round — review breadth + Zabar's description (host publish)

Start HEAD `021b68674a1535cb29e8fa2a4b8ecdb4ce46bc80` (verified). Handoff `bot-admin/lanes/vk-pr-handoff/pr-653` 2026-10-23 5:20 AM PT.

## Root cause (reviews 6/10 → 4/10 on `021b6867`)

`finalizeReviewSet` dropped code-extracted reviews whenever the xAI extract step returned a `keep` list that omitted their candidate ids. Non-Reddit aggregator pages (Yelp, TripAdvisor, Booking, Trustpilot, etc.) were removed even when grounded on the saved page, collapsing `reviewSources` to one host while `reviewsRead` stayed high.

## What changed

- `src/vacation/dossier-review-extract.mjs`: keep grounded reviews from review-aggregator hosts when `keep` omits them; JSON-LD `description` on aggregator pages; `incredible` in opinion detector; `reviewAggregatorHost` helper.
- `src/vacation/thing-evidence-dossier.mjs`: Tavily topics `trustpilot reviews` and `opentable OR resy reviews`.
- `src/vacation/thing-evidence-dossier-execution.mjs`: pass NYC trip center (`40.758, -73.9855`) and place coords into `fetchXaiPlaceRatings` so Brave `place_search` runs for acceptance/staging targets.
- `src/vacation/xai-grok-place-ratings.mjs`: after judge, repair description from **supported-only** claims (Zabar's path) via `repairDescriptionFromSupportedClaims`; widen extract candidate cap to 90.
- `scripts/test_thing_evidence_dossier.mjs`: regressions for aggregator keep + description repair.

No Gate B, capture, fixture-replay, bundle, or Flights/Hotels UI changes.

## Uncommitted files (host commit once)

```
scripts/test_thing_evidence_dossier.mjs
src/vacation/dossier-review-extract.mjs
src/vacation/thing-evidence-dossier-execution.mjs
src/vacation/thing-evidence-dossier.mjs
src/vacation/xai-grok-place-ratings.mjs
J/RECEIPT.md
```

## Checks run (workspace @ `021b6867` + above diff)

| Check | Result |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | PASS |
| `node scripts/test_thing_evidence_dossier.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (291 offline) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS |

Not claimed: full `run-offline-tests.mjs`, CI, Gate B 32/32, run10 acceptance (DESC/REV 10/10), merge.

## Left alone (per handoff)

Flight/hotel list prices, hotel description quality scores — #659. Gate B capture/check edits.
