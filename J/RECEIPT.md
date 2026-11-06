# #830 / #827 — CI fix: synthesized reviews + rating resolution (cursor-ubuntu 2026-11-06)

**Start HEAD (verified):** `669b3a2e818dbfabeff8f3dcbc92b98d69af4ef0`

**Base merge:** Host merged `origin/vk` at `a503e6870f6739c51fee8b348b3beb8945f7a611` into this worktree; `J/RECEIPT.md` conflict resolved keeping PR #830 receipt plus this line.

## Uncommitted patch (host publishes; not committed in this sandbox)

**Goal:** Align `resolveDossierReviewRatings` / vk-search path so page-supported synthesized reviews still map when per-review stars are omitted, preserve fail-closed + venue mean-drift when grounded, fix ESM import cycle that prevented loading `dossier-review-ratings.mjs` without `@neondatabase/serverless`, and tighten Trip.com-only `/10` handling per tests.

**This round (2026-11-06):** `writeDossierReviews` + `dossierReviewsWritable` — four grounded integer star ratings on verified dossier pages suffice to write review slots without per-quote `claims` (Craig: stars on every shown review; never invent). Representative / full-valid paths unchanged (still require `claimsSupported`). Avoids leaving `reviews` in `missingFields` when review text is emitted. Safe `claims` iteration when absent.

**Files touched**

- `src/vacation/dossier-page-integrity.mjs` — `dossierPagesVerified` moved here (no cycle).
- `src/vacation/dossier-rating-evidence.mjs` — **new** — `ratingQuoteSupportsAggregate`, `pageTextSupportsRating` (shared with review ratings).
- `src/vacation/dossier-review-url.mjs` — **new** — `reviewSourceHost` (breaks `thing-dossier-fields` ↔ `thing-evidence-dossier` cycle).
- `src/vacation/dossier-review-ratings.mjs` — Early return when no `reviews` array; keep unrated reviews that are not explicitly ungrounded; integer 1–5 `rating`; mean-drift only when every row has a finite rating; preserve pre-set `starsEvidence` when merging stars; strip reviews only when explicit rating fails parse and venue absent.
- `src/vacation/dossier-vk-search.mjs` — Trip.com: `/10` only when `review{N}Source` is Trip.com; prefer `review{N}Rating` x/10 over Stars/Score10; when both stars and x/10 present, keep raw `review{N}Rating` as `starsEvidence`.
- `src/vacation/thing-dossier-fields.mjs` — Imports from `dossier-page-integrity`, `dossier-rating-evidence`, `dossier-review-url`; re-exports rating helpers; writable-review + missingFields fix (this round).
- `src/vacation/thing-evidence-dossier.mjs` — Re-export `dossierPagesVerified` from page-integrity; drop duplicate `reviewSourceHost` export.
- `src/vacation/dossier-review-extract.mjs`, `thing-dossier-ratings-copy.mjs`, `thing-evidence-dossier-field-counts.mjs` — import `reviewSourceHost` from `dossier-review-url.mjs`.

## Tests run (this worktree)

| Command | Result |
|---------|--------|
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | **PASS** |
| `node scripts/test_thing_evidence_dossier.mjs` | **PASS** |
| `node scripts/test_vk_search_review_lines.mjs` | **PASS** |
| `node scripts/test_dossier_representative_reviews_written.mjs` | **PASS** |
| `node scripts/test_apply_dossier_ratings_copy.mjs` | **PASS** |
| `node scripts/test_vk_search_rating_evidence.mjs` | **PASS** |
| `node scripts/test_dossier_rejected_claims_shortcomings_682.mjs` | **PASS** |
| `node scripts/test_dossier_reviews_identity_682.mjs` | **PASS** |
| `cd apps/vacation-client && npm test` | **PASS** (after root `npm ci` for `@neondatabase/serverless`) |
| `node scripts/test_offline_manifest.mjs` | **PASS** |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (needs root `node_modules` / `apps/vacation-client` deps for TypeScript API) |
| `git diff --check` | **PASS** |

**Scope / not done:** No commit, push, or merge (host publication only). CI not run here.

---

## Earlier: eggbot host graft 2026-11-06 8:32 AM PT

Grafted code files from local tip 519498b6 onto PR tip 313af5a7 (diverged siblings off be0d5486). PR tip had evidence PNG churn + stale #820 receipt; wt tip had the rating generator/tests.

Host does not invent ratings.
