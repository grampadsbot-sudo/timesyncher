# #830 / #827 — CI fix: synthesized reviews + rating resolution (cursor-ubuntu 2026-11-06)

**Start HEAD (verified):** `8320a6df86cbb15a7d7fd25fbdf1295ab7522d65`

## Uncommitted patch (host publishes; not committed in this sandbox)

**Goal:** Align `resolveDossierReviewRatings` / vk-search path so page-supported synthesized reviews still map when per-review stars are omitted, preserve fail-closed + venue mean-drift when grounded, fix ESM import cycle that prevented loading `dossier-review-ratings.mjs` without `@neondatabase/serverless`, and tighten Trip.com-only `/10` handling per tests.

**Files touched**

- `src/vacation/dossier-page-integrity.mjs` — `dossierPagesVerified` moved here (no cycle).
- `src/vacation/dossier-rating-evidence.mjs` — **new** — `ratingQuoteSupportsAggregate`, `pageTextSupportsRating` (shared with review ratings).
- `src/vacation/dossier-review-url.mjs` — **new** — `reviewSourceHost` (breaks `thing-dossier-fields` ↔ `thing-evidence-dossier` cycle).
- `src/vacation/dossier-review-ratings.mjs` — Early return when no `reviews` array; keep unrated reviews that are not explicitly ungrounded; integer 1–5 `rating`; mean-drift only when every row has a finite rating; preserve pre-set `starsEvidence` when merging stars; strip reviews only when explicit rating fails parse and venue absent.
- `src/vacation/dossier-vk-search.mjs` — Trip.com: `/10` only when `review{N}Source` is Trip.com; prefer `review{N}Rating` x/10 over Stars/Score10; when both stars and x/10 present, keep raw `review{N}Rating` as `starsEvidence`.
- `src/vacation/thing-dossier-fields.mjs` — Imports from `dossier-page-integrity`, `dossier-rating-evidence`, `dossier-review-url`; re-exports rating helpers.
- `src/vacation/thing-evidence-dossier.mjs` — Re-export `dossierPagesVerified` from page-integrity; drop duplicate `reviewSourceHost` export.
- `src/vacation/dossier-review-extract.mjs`, `thing-dossier-ratings-copy.mjs`, `thing-evidence-dossier-field-counts.mjs` — import `reviewSourceHost` from `dossier-review-url.mjs`.

## Tests run (this worktree)

| Command | Result |
|---------|--------|
| `node scripts/test_vk_search_review_lines.mjs` | **PASS** |
| `node scripts/test_dossier_representative_reviews_written.mjs` | **PASS** |
| `node scripts/test_offline_manifest.mjs` | **PASS** |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (0 fail) |
| `git diff --check` | **PASS** |
| `node scripts/check-no-comments.mjs` | **Not run** — fails: `Cannot find module '.../apps/vacation-client/node_modules/typescript'` (incomplete `node_modules` in this checkout; host full install should run this pre-push). |

**Scope / not done:** No commit, push, or merge (host publication only). CI not run here.

---

## Earlier: eggbot host graft 2026-11-06 8:32 AM PT

Grafted code files from local tip 519498b6 onto PR tip 313af5a7 (diverged siblings off be0d5486). PR tip had evidence PNG churn + stale #820 receipt; wt tip had the rating generator/tests.

Host does not invent ratings.
