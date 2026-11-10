Host base-merge: `origin/vk` `5a0d72e5a607fa4234bf687a956bb34e96cd10e2` into PR head `9bbe396156779192097e76f12b9e46eaa0453d1c`. **Lane start HEAD:** `9bbe396156779192097e76f12b9e46eaa0453d1c` (verified). **Model:** composer-2.5. **Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY).

# PR #896 / issue #888 — flight time chips @390

## Problem restatement

At 390px, flight list cards keep departure and arrival on one horizontal track with `min-width: max-content` on `.tsv-row-flight-time` and `[data-ts-flight-time="1"]` (`apps/vacation-client/src/styles.css` @media max-width 480px; `ISSUE_888_SERVED_LAYOUT_CSS` in `src/vacation/shared-trip-oe-list-row-patch.mjs`). Non-shrinking time chips plus a four-column mobile grid let arrival text extend past the card padding and clip the right border. Day-by-day conflict wrap and airline logos on this head are intended and must stay.

## Product fix

- **Served rows:** `ISSUE_888_SERVED_LAYOUT_CSS` two-row CSS grid for `[data-ts-flight-row-grid="1"]` at ≤480px (times on row 2; logo/name spans rows).
- **Vacation client:** `.tsv-row-flight-main` @390 — three-column grid (`auto minmax(0,1fr) auto`); logo spans rows 1–2; title and price row 1; depart col 2 and arrive col 3 on row 2, right-aligned inside the card.
- **Merge:** keep PR #888 conflict-label wrap (`trek-live-product-patches.mjs`, `trek-live-product-flight-day-patches.mjs`) plus vk #887 timeline patches; both offline tests in manifest.
- **Rebake:** `node scripts/rebake_served_trek_bundle.mjs` after patch files resolve (host index).

## Conflict resolution @ `9bbe3961`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | This file (PR #896 receipt; vk #941 mic receipt dropped). |
| `public/assets/index-BKun7ofk.js` | `origin/vk` then rebake. |
| `scripts/offline-tests.txt` | Both `test_issue_888_clipped_text.mjs` and `test_issue_887_daybyday_time_column.mjs`. |
| `trek-live-product-patches.mjs` | PR wrap conflict label + served guard; vk car/budget/timeline patches retained. |
| `trek-live-product-flight-day-patches.mjs` | vk #887 imports + PR conflict-label wrap needles/patches. |

## Checks @ PATCH (lane END)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `31e18ae6bc65be8d1380f39abaa5f51af7ef58ef9d771cbedd54d42c4d29c128` |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS (390 DOM chip bounds) |
| `node scripts/test_issue_887_daybyday_time_column.mjs` | PASS |
| `node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1145 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (446 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (251 report, 0 fail) |

## Uncommitted for host

Conflict markers cleared (still UU until `git add`): `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js`, `scripts/offline-tests.txt`, `src/vacation/trek-live-product-flight-day-patches.mjs`, `src/vacation/trek-live-product-patches.mjs`. Product edits: `apps/vacation-client/src/styles.css` (@390 three-column flight grid). Rebaked bundle + vacation-client dist from checks. Host merge tree + vk carry files staged from merge (see `git status`).

## Host publish

`git add` resolved paths; `git commit --no-edit` (merge); push `vkfill/888-20261109142715`; CI; Gate B allow `888`. Lane did not stage, commit, push, or merge.
