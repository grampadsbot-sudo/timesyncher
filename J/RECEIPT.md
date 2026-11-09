# Issue #869 — NYC reviews refill: harden writeDossierReviews + resolveDossierReviewRatings

Start HEAD: `15041c9a3257c4e44b4d00074156ca8c515a6999`

## Problem

Dossier re-apply cleared public `review1..4` when `evidenceDossier.reviews` still had four texts but per-review `rating` was null. `resolveDossierReviewRatings` only backfilled stars from excerpts, per-review ratings, or **page-cited** `ratingEvidence` (`citedVenueRating`). With null review stars and no cited aggregate, `writeDossierReviews` hit the wipe path even though `dossier.rating` remained on the saved dossier (NYC 19-thing regression per brief live facts sha256 `75dae0c5615ff2f322616bcda105b46178d3631fe71d8c027a498e88c8513835`).

## Fix

| Path | Change |
| --- | --- |
| `src/vacation/dossier-review-ratings.mjs` | `savedVenueStars()` fills review stars from saved `dossier.rating` when pages verify and `ratingEvidence` is absent or unsupported-only; mean-drift correction still requires `citedVenueRating` (no drift normalize on dossier.rating-only fallback). |
| `src/vacation/thing-dossier-fields.mjs` | `dossierSavedReviewsPublishable()` write path after resolve; skip null wipe when four resolved publishable reviews exist. |
| `scripts/test_dossier_representative_reviews_written.mjs` | Lock null review stars + present `dossier.rating` → public reviews; wipe only when rating grounding absent (`bare`). |

## Local proof (uncommitted on `15041c9a`)

| Command | Result |
| --- | --- |
| `node scripts/test_dossier_representative_reviews_written.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | FAIL (lane env: missing `apps/vacation-client/node_modules/typescript` for comment-tools) |
| `node scripts/test_dossier_reviews_identity_682.mjs` | SKIP (missing `@neondatabase/serverless` in lane checkout) |

## Host publish

Uncommitted patch in `/home/ubishere9995/tsv-work/vkfill-869-20261109101625` (3 files). Host: branch from `15041c9a`, `npm install` if needed for pre-push gates, commit → push once → PR into `vk` with `Closes #869`. Host owns live_accept reviews_rule, Neon copy-trip restore, NYC 19-thing TREK refill, Gate B if UI-visible.

## result

source-ready 15041c9a
