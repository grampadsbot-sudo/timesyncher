# #827 — reviewNRating fail-closed (eggbot host graft 2026-11-06 8:32 AM PT)

Grafted code files from local tip 519498b6 onto PR tip 313af5a7 (diverged siblings off be0d5486). PR tip had evidence PNG churn + stale #820 receipt; wt tip had the rating generator/tests.

Files: rederive_review_ratings.mjs, test_dossier_representative_reviews_written.mjs, dossier-review-ratings.mjs, dossier-vk-search.mjs, thing-dossier-fields.mjs.

Next: CI unit-tests on new head; if red, Cursor window (#827 allow) owns the fix-it round. Host does not invent ratings.
