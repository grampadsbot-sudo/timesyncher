# Issue #903 — P2 live QA polish (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH (uncommitted; host publication). **Start HEAD:** `968c7ac8b01fda265bd4d2e265ab7115883191ea`.

## Changes (7 acceptance items)

1. **Full screen vs hero wordmark (signed-in app):** `vacation-app.html` moves `.fullscreen-button` to bottom-right (`top: auto; bottom: 8px`) so it clears the iframe hero wordmark at 390/1280. Checker: `scripts/test_issue_903_live_qa_polish.mjs` (CSS assert).
2. **Borrowed ratings on composed events 606/607:** `src/vacation/live-qa-903-presentation.mjs` strips star fields when `missingFields` includes `ratings`; wired in `prepareSharedTripForLiveApp`.
3. **Star/text single source of truth:** `src/vacation/star-rating-model.mjs` + served-bundle inject prefer the rating cited in narrative (`<source> shows N.N`); presentation align clears conflicting Google/Yelp when cited.
4. **Detail chrome:** `src/vacation/trek-qa-903-ui-patch.mjs` removes `Detail page` eyebrow; Itinerary note / Details headings match Summary/Reviews uppercase style. Rebaked `public/assets/index-BKun7ofk.js` (sha256 `528a9cf76f5e59bdf9094a8b555af5e59f3950ffd4a63921ad286501c4806ab7`).
5. **Trip-month hours:** presentation strips off-season month labels (e.g. Bryant Park `Oct:` on June trips).
6. **Jargon / Priceline opaque / kept option / Business Select upsell:** customer wording in presentation layer; 634 retitled to `Business Select® upgrade (…)` with `category: other`.
7. **Flight titles without clock times:** `stripClockRangeFromTitle` on served flight Things (times stay in schedule chips / `departureTime`).

**Also:** `public/ts-thing-media-overlay.js` finds detail host via `[data-ts-detail-name]` (not `DETAIL PAGE`); `scripts/test_bind_thing_media.mjs` updated.

## Checks run (lane)

| Check | Result |
| --- | --- |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256=528a9cf76f5e59bdf9094a8b555af5e59f3950ffd4a63921ad286501c4806ab7 |
| `node scripts/test_bind_thing_media.mjs` | PASS |
| `node scripts/test_served_star_rating_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/test_offline_manifest.mjs` | **Host:** register `scripts/test_issue_903_live_qa_polish.mjs` in `scripts/offline-tests.txt` (coder lane may not edit manifest per brief) |

## Uncommitted (host publish)

- `src/vacation/live-qa-903-presentation.mjs` (new)
- `src/vacation/trek-qa-903-ui-patch.mjs` (new)
- `scripts/test_issue_903_live_qa_polish.mjs` (new)
- `src/vacation/star-rating-model.mjs`, `shared-trip-live-tab-lists.mjs`, `trek-style2-bundle.mjs`
- `vacation-app.html`, `public/ts-thing-media-overlay.js`, `public/assets/index-BKun7ofk.js`
- `scripts/test_bind_thing_media.mjs`, `J/RECEIPT.md`

## Host follow-up

- Register offline test + one push/PR with `Closes #903`
- Gate B / NYC screen probes on new head (not self-certified here)
- `npm install` was run locally for tests; do not commit `package-lock.json` unless host intentionally refreshes lockfile

## Not touched

Baselines, Gate B config, `.github/`, `package.json`, NYC fixture bodies, deploy config.
