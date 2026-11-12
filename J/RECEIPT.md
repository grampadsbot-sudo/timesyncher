# TSV #968 — list dates and gold stars

Outcome: **partial, uncommitted source for host review**, based on actual starting HEAD `6683cfc3e72156ca67d47f08f958d4bf75485185`. The same HEAD remains checked out. This is not an issue-complete, acceptance-success, CI-green or publication claim.

Written close verdict: **keep #968 open**. Host should review the patch and use `J/PR_DESCRIPTION.md` for one draft PR into `vk` with `Closes #968`. The acceptance visibility failures and legacy hotel harness must be resolved by their owners before the published head can meet the brief. No commit, stage, branch change, push, merge, rebase, Git metadata write/probe, deploy or external message was performed.

Authority read via the existing `gbrain` CLI: `bot-admin/decisions/vk-list-dates-20261112` and `bot-admin/decisions/vk-mockup-feedback-20261112`. These approve v3 and make deterministic WebKit touch acceptance at 390/430 authoritative, with pixel diff advisory. The earlier generic Gate B wording does not replace that ruling. GBrain process, verification, keepsake, data-contract and required SoT snapshots are under the job's `evidence/gbrain/`. Access/routing checked in `skills/tsv-qa-visual-gate/skill`; local receipt only, for host filing. pstack and extra agents were not loaded or launched.

## Source changes

- `src/vacation/list-row-dates.mjs`: scoped patch to existing Oe list header for flights/hotels/cars. Pure date formatter reads stored timing, existing day assignments and structured legacy timing text. Same-day labels state the day once. UTC calendar subtraction preserves zero/negative/after-trip day numbers. Flight labels include times and stored/route-derived seasonal zone abbreviations; westbound clock differences do not imply an overnight.
- `src/vacation/trek-style2-bundle.mjs`: applies that patch to the existing served renderer, after existing Thing-detail patches.
- `public/assets/index-BKun7ofk.js`: generated with `node scripts/rebake_served_trek_bundle.mjs` from the existing upstream commit; no alternate app or print renderer.
- `public/assets/index-CbEHlMj6.css`: narrowly scoped list star sizing, exact gold fills and name-only underlining. No existing CSS block removed.
- `scripts/test_served_star_rating_bundle.mjs`: additional date/zone/idempotence/style assertions; all existing assertions retained. No new test file, manifest change or gate adjustment.
- `features/itinerary-surfaces.md`: Feature Map entry tied to #968 and the approved decision.

Name/logo and one-line price remain together. Hotel display uses `/ night`, cars use `total`; stars/date ranges share the second row. Other categories and Thing view/edit retain their existing branches. Missing ratings are not fabricated: this snapshot has qualifying rendered stars in Hotels, but no qualifying aggregate star evidence for its Flights/Cars. Existing snapshot logo gaps were left to the data owner.

## Checks and evidence

All paths below are under `/home/ubishere9995/tsv-work/vkfill-968-job/evidence/`; they describe the uncommitted patch at starting HEAD `6683cfc3e72156ca67d47f08f958d4bf75485185`. Exact source hashes: `source-manifest.json`. Commands and exit codes: `checks.json`.

| Check | Result and receipt |
| --- | --- |
| `node scripts/test_served_star_rating_bundle.mjs` | exit 0 — `stars-and-dates.txt` |
| `node scripts/test_served_trek_bundle.mjs` | exit 0 — `served-bundle.txt` |
| `node scripts/test_issue_959_flight_row_detail_price.mjs` | exit 0 — `959-regression.txt` |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | exit 0 — `itinerary-regression.txt` |
| `node scripts/test_thing_card_ui_keep.mjs` | exit 0 — `thing-card.txt` |
| `npm run test:keepsake-style2` | exit 0 — `keepsake-style2.txt` |
| `node scripts/check-no-comments.mjs` | exit 0 — `no-comments.txt` |
| `node scripts/test_offline_manifest.mjs` | exit 0, existing 455 offline / 21 online — `offline-manifest.txt` |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0, zero new failures — `code-ratchet.txt` |
| `TIMESYNCHER_BUILD_SHA=6683cfc3e72156ca67d47f08f958d4bf75485185 npm run build` | exit 0 — `build-with-sha.txt`; base SHA is not a published-patch identity |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | exit 1 — `hotels-legacy.txt`; first error: `ReferenceError: tsListDateRange is not defined` |

The hotel harness slices the previous renderer into a stub environment without the new date helper/runtime inputs and subsequently expects stars on the right with price beside them. That expectation conflicts with the approved v3 stars-left/date-right row. Its checks were not weakened, skipped or rewritten. This limits CI readiness.

Initial environment had no installed dependencies. Installed only the existing root/client lockfiles using `npm ci --ignore-scripts`, with the npm cache in this job; package manifests and lockfiles are unchanged. The first unstamped build failed with `timesyncher build SHA is missing: ""`; the explicit base-SHA build above supplies the existing required input. An initial ratchet invocation with a raw SHA failed because the script resolves `origin/<BASE>`; the required `BASE=vk` invocation above resolves the existing base and exits 0. These were local invocations, not CI reruns.

## Deterministic acceptance limitation

Command: `node /home/ubishere9995/tsv-dispatch/acceptance/run_acceptance.mjs --spec /home/ubishere9995/tsv-dispatch/acceptance/968.json --checkout /home/ubishere9995/tsv-work/vkfill-968-20261112114229 --out /home/ubishere9995/tsv-work/vkfill-968-job/evidence/final-head-acceptance`.

The initial unmodified checkout report is `before/report.json` (30/30 assertions failed at `6683cfc3e72156ca67d47f08f958d4bf75485185`). Intermediate diagnostic report `final-acceptance/report.json` records 25/30 assertions satisfied, with five `visible_on` failures: Flights/Hotels/Cars at 390, Hotels/Cars at 430. All five find the dates rendered, but report `topmost:false`: the list content is below the visible part of the unscrolled site iframe in the initial split-pane state. Row bounds, price/date single lines and star/date alignment assertions satisfy their checks. Final exact-patch result is appended below when the runner finishes.

The acceptance/check configuration and pane chrome remain untouched. The acceptance owner needs to examine the initial scroll/visibility scenario; the product brief authorizes only row dates/stars, not a split-pane redesign. No acceptance status was posted to GitHub. CI run id and published PR head: not found, because publication belongs to the outer host.

## Mobile diagnostic review

`mobile/geometry.json`, `mobile-final.log` and the six `mobile/{flights,hotels,cars}-{390,430}.png` show real served app rows on the read-only local snapshot. Measurements cover 10 flights, 22 hotels and 7 cars at each width: zero date wraps, row overflow or star/date overlap; all available filled star paths compute to `rgb(245, 158, 11)`. There were no page errors or API writes. First rows were scrolled into view for this diagnostic review. That diagnostic does not replace the unmodified official acceptance scenario. Compared the six v3 reference frames read-only; no fixture, reference or baseline image changed. Missing flight/car star evidence and the existing unavailable hotel logo were left alone rather than replaced.

No live NYC itinerary was read or written. Only the dispatcher-supplied local snapshot was served. No secrets/env files, workflows, capture/Gate B scripts, thresholds, baselines, dependencies or deploy configuration were edited. All source changes remain uncommitted for host review; Git mutations and the one PR/publication remain entirely host-owned. No source write failed.

## Final exact-patch verdict

`accept=failure`: **25/30 assertions satisfied, 5 visibility failures**, WebKit 26.6, iPhone touch 390/430. Reference: starting HEAD `6683cfc3e72156ca67d47f08f958d4bf75485185` plus `evidence/source-manifest.json`, `evidence/final-head-acceptance/report.json` and `evidence/final-head-acceptance.log`. The failures are Flights/Hotels/Cars at 390 and Hotels/Cars at 430, each `rendered:true`, `topmost:false`. The read-only snapshot runner recorded zero API writes. No check configuration was modified.

Pre-DONE commands all exited 0 for this source manifest: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`; references: `6683cfc3e72156ca67d47f08f958d4bf75485185`, `evidence/checks.json` and the individual logs. Outcome remains **partial**, keep #968 open. Host review and publication are outstanding; source remains uncommitted.
