# TSV #969 — host publication receipt

Result: **source-ready; uncommitted for host review**, based on actual starting HEAD `6683cfc3e72156ca67d47f08f958d4bf75485185`. Ending HEAD is the same. Close verdict: keep #969 open until the host publishes its single PR into `vk` and CI is green on that head. No PR head, CI run or live-build verdict is claimed here.

Authority: GBrain `bot-admin/decisions/vk-edit-mode-20261112` (rev e0abc44a-02cc-4d8d-9d31-327bab9b1bab) and `bot-admin/decisions/vk-mockup-feedback-20261112` (11:33 two-checkbox, 11:35 build approval, 11:36 sparse-field amendments). Lane/model: codex-ubuntu / gpt-6.1-sol only; one agent, no subagents or paid fallback.

## Source change

The existing TREK detail renderer now orders Timeline, Story, Happy Hour, Summary, Reviews, Photos & videos, then remaining fields. The original separate readonly/edit duplication is replaced inside that panel. The patch is reproducible through `renderServedTrekBundle`; no route, endpoint, dependency, parallel book or renderer was added.

- Visits extend existing `perDaySchedule[dayId]` with a `visits` array, mirroring the first visit into the legacy schedule fields. Multiple visits on one day or multiple days have their own start/duration/status, add/remove controls and clocks without seconds. There is no Thing-level Status control.
- Story inclusion and Next Time are independent controls writing their existing fields. Unchecked controls hide in view. Sparse Things retain the same editable Story, Happy Hour, contacts, hours and other standard fields; filled view sections appear and cleared sections disappear.
- Reviews remain read-only gold stars above stored blurbs, without added source/rating labels. Bound photos/videos share a section, using existing media/caption storage. Header stars and Price remain left/right; editing shows the checkmark beside Close.
- Feature inventory: `features/detail-page.md`. Product/test hashes: `/home/ubishere9995/tsv-work/vkfill-969-job/source-manifest.json`.

## Verification on this uncommitted candidate at 6683cfc3e72156ca67d47f08f958d4bf75485185

| Command | Local result and evidence |
| --- | --- |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` | success, iPhone WebKit touch 390 and 430; `/home/ubishere9995/tsv-work/vkfill-969-job/webkit-969-final.log`, `/home/ubishere9995/tsv-work/vkfill-969-job/acceptance/969.json` (`accept=success`) |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | passed; `/home/ubishere9995/tsv-work/vkfill-969-job/pencil-951.log` |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | passed; `/home/ubishere9995/tsv-work/vkfill-969-job/rating-964.log`; original view assertions retained and edit-price persistence assertion added |
| `npm run test:keepsake-style2` | passed; `/home/ubishere9995/tsv-work/vkfill-969-job/keepsake.log` |
| `npm run build` | passed; `/home/ubishere9995/tsv-work/vkfill-969-job/build.log`; starting HEAD supplied as `TIMESYNCHER_BUILD_SHA` |
| `node scripts/check-no-comments.mjs` | passed, 1167 scanned; `/home/ubishere9995/tsv-work/vkfill-969-job/no-comments.log` |
| `node scripts/test_offline_manifest.mjs` | passed, 455 offline / 21 online; `/home/ubishere9995/tsv-work/vkfill-969-job/offline-manifest.log` |
| `BASE=vk node scripts/check-code-ratchet.mjs` | passed, 0 fail; `/home/ubishere9995/tsv-work/vkfill-969-job/ratchet.log` |
| `git diff --check` | passed; `/home/ubishere9995/tsv-work/vkfill-969-job/diff-check.log` |

Browser acceptance checks owner versus viewer access, section order and gold, compact one-line visits, independent flags, multiple times/day changes, removing every visit, field-write persistence and reload, bound photo/video presence, no-timeline hiding, and sparse Story/Happy Hour/Hours fill then clear. All writes go to a local in-memory server using a snapshot copy and synthetic user-entered notes, never the live NYC itinerary.

Dependencies were absent in the supplied worktree. Commands used existing host packages read-only via `/home/ubishere9995/tsv-work/vkfill-969-job/dependency-loader.mjs`; set `NODE_OPTIONS=--import=/home/ubishere9995/tsv-work/vkfill-969-job/dependency-loader.mjs`, `NODE_PATH=/home/ubishere9995/tsv-dispatch/pr-src/node_modules`, and prepend that host node_modules/.bin to PATH for npm build. No installation or dependency manifest change. A raw SHA BASE invocation was rejected by the existing ratchet's `origin/<BASE>` lookup; the required `BASE=vk` invocation passed. No check configuration was changed.

## Screenshot review

Ten final captures in `/home/ubishere9995/tsv-work/vkfill-969-job/shots/`: view-populated, view-no-timeline, view-sparse, edit-populated and edit-sparse, each at 390 and 430. The capture adapter asserts the actual view/edit mode after resizing and captures the entire panel. `/home/ubishere9995/tsv-work/vkfill-969-job/screenshot-manifest.json` binds these PNGs to this candidate. All ten were visually inspected against the approved v3 layout and amendments. Screenshots are advisory only, not authority for acceptance or CI. An early capture adapter lost edit state during resizing; its corrected final capture asserts mode explicitly. No product change was made in response to that adapter issue.

The snapshot has no separate Carbone Happy Hour/hours and has long review blurbs. Those empty sections hide and the supplied text remains intact. Consequently these captures are not pixel-identical to fictional Juniper Table mock content; no pixel PASS or Gate B run is claimed. The deterministic sparse fill/clear checks exercise the missing fields through the real editing controls.

## Scope, ownership and handoff

Uncommitted product paths: `src/vacation/trek-thing-detail-v3-patch.mjs`, `src/vacation/trek-style2-bundle.mjs`, `public/assets/index-BKun7ofk.js`. Tests: `scripts/test_issue_959_owner_pencil_webkit.mjs`, `scripts/test_issue_964_detail_overall_rating_row.mjs`. Feature map: `features/detail-page.md`. Handoff: `J/RECEIPT.md`, `J/PR_DESCRIPTION.md` and copies in `/home/ubishere9995/tsv-work/vkfill-969-job`. No new test file; offline manifest unchanged.

Flights/Hotels/Cars list dates, all fixtures/snapshots/references, workflows, Gate B/capture scripts, thresholds/allowlists, deploy config, packages and secrets were left alone. No Git metadata mutation/probe, stage, commit, push, merge, rebase, deploy, alternate model, external message, SCT/QA launch or CI rerun occurred. GBrain source pages and required verification/process skills were read; pstack was not loaded because no hard-fix clearance was supplied. Receipt stays local for host publication. Hold certify.

Host: review `PATCH.diff`, commit/push once, open the single PR into `vk` with the supplied description containing `Closes #969`, run CI/required exact-head acceptance, and file the publication receipt. Local success is not an immutable PR-head verdict.
