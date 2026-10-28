# PR #693 U2–U5 source handoff

Outcome: source-ready for host review only; all source changes are uncommitted on starting HEAD `04e5f55e5c7c8a4ca4bc39e96c306214cd53711d`. No new commit or pushed head exists. Product acceptance remains open.

Authorization: the current chief comment clears `hold:dr-diagnosis` and `hold:after-687` and launches `R-693-fold-u2-u5-20261027`: https://github.com/grampadsbot-sudo/timesyncher/pull/693#issuecomment-6455960934 . Current PR head and branch matched the brief. Read-only live evidence is saved in `pr-693-current.json` and `pr-687-current.json` in the job directory. GBrain `bot-admin/lanes/vk-pr-handoff/pr-693` is older; the current launch authorizes source work. Data-filled build remains required for acceptance by `bot-admin/messages/time-syncher/two-pr-strategy` and `bot-admin/messages/time-syncher/ui-acceptance-matrix`.

## Source changes

- U2: reuse the existing emoji ink-centering/mobile label behavior and center vector tab icons in the same 16px flex slot; no 0.75px nudge imported from #591. New maintained source module is `src/vacation/trek-tab-icon-center-patches.mjs`, imported by the existing bundle builder. This is a candidate fold, not proof that Craig's original emoji case is accepted.
- U3: align time and title to their grid baseline only for a single non-conflict time. Preserve ranged, untimed and conflict rendering. Runtime cases execute the actual emitted row expression.
- U4: remove name/summary truncation in the actual served Oe list renderer and hotel/car name headers. Preserve the nonshrinking nowrap price cell, original row controls and U1 stars. Runtime cases execute actual emitted compact/expanded hotel rows with long text and a price.
- U5: fold #590's useful production logo resolution into preview list lookup and the shared server logo resolver. Recognize nested metadata/source_record logos, captured logos and saved override website URLs. Existing override preference and story-media rejection remain. Test the served payload finalizer with distinct sourced logos. No fixture replay route or capture modification imported.
- Rebuilt `public/assets/index-BKun7ofk.js` using `node scripts/rebake_served_trek_bundle.mjs`; byte parity with the maintained builder is checked. No hand edit of compiled output.

Feature Map coverage already exists in `features/README.md`: `features/itinerary-surfaces.md` (tabs), `features/day-view.md` (timeline), `features/logos.md` (logos), `features/hotel-stay-fields.md` and `features/ratings-reviews.md`. No UI acceptance claim is made.

## Local validation on 04e5f55e5c7c8a4ca4bc39e96c306214cd53711d + PATCH.diff sha256 381c3ef1e6df5c10eda0eaf746a6255edbefc13e2a575c9df3dd42f99fc305bd

14 focused checks exited 0; see `focused-checks.json` and their logs. These include U1 star model/served bundle, category tabs, Day-by-Day, shared list summary, source/served logos, logo centering, shared categories and `node scripts/test_keepsake_style2.mjs`. After adding runtime assertions, the Day-by-Day and list-summary checks again exited 0. No existing assertion was removed or loosened; no new test file was introduced.

Production build exited 0: `VERCEL_GIT_COMMIT_SHA=04e5f55e5c7c8a4ca4bc39e96c306214cd53711d npm run build`. The first build lacked the required build SHA; the corrected command uses the existing declared input. The stamp is the starting HEAD, not a claim of a new published build. Locked root and vacation-client dependencies were installed with `npm ci --ignore-scripts`; manifests and lockfiles were unchanged.

Required handoff checks exited 0 (logs in job directory):
- `node scripts/check-no-comments.mjs`: 872 files scanned.
- `node scripts/test_offline_manifest.mjs`: 297 offline / 17 online.
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`: 255 report / 0 fail.
- `git diff --check`.

## Visual and publication limits

NOT merge-eligible yet. No new-head CI, current structure-mode 32-screen Gate B, Craig-eye acceptance, live build SHA, or Style one/two live+PDF QA receipt was produced. Source PRs #591/#590/#560/#550 remain open and no U row is accepted.

The supplied fixture `/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json` fails the current capture pre-data check: 52 failures (21 hotel_description_judge, 31 blank_price). Exact result: `capture-pre-data-check.json`. Example: Arthouse Hotel generic `Documented NYC option (hotel)` and blank price. The current #687 head `2ba6416b7afe11325c96a53d1891f594fdf9c9ad` also retains `hold:test-trip-fixture`: https://github.com/grampadsbot-sudo/timesyncher/pull/687#issuecomment-6455759536 . These are data/harness prerequisites, not UI text to invent or checks to relax.

`baselines/manifest.json` is absent in this worktree. GBrain access was successfully checked with `gbrain get bot-admin/lanes/vk-pr-handoff/pr-693`, `gbrain get skills/vk-thing-data-contract/skill`, `gbrain get skills/timesyncher-vacation-verification/skill`, `gbrain get bot-admin/messages/time-syncher/two-pr-strategy`; snapshots are in the job directory. The engineering/verification skills state NYC screenshots are historical references, not approved baselines. No baseline was substituted or edited.

One local browser diagnostic was attempted against the built served route, without capture CSS or product environment detection. Command: `node /home/ubishere9995/tsv-work/vkfill-693-20261027161756-job/inspect-served-ui.mjs`. It exited 1: `TimeoutError: Waiting for selector [data-ts-tab] failed` (15000ms). No screenshots were produced (diagnostic-ui.json has 0 screens); this failed local harness attempt is not evidence of a source pass or a Gate B verdict. No second browser/capture round ran. The script/report remain job-only, outside the source patch.

## Host next action

Review/apply the uncommitted source candidate and PATCH.diff, including the new tab module. The outer host owns commit, push, PR publication and any lane-END wake. Preserve ownership, round history, quotas and remaining data/harness holds. Obtain a data-filled build, then perform the sanctioned 390/1280 checks for U2–U5 and U1 regression plus current named 32-screen Gate B and exact published-head CI before acceptance. Do not merge this candidate on these local checks alone.

No Git metadata mutation, source publication, merge, rebase, deployment, external messaging, paid/model fallback, provider fill, baseline/check/config/dependency change, SCT/QA launch, or gate reset was performed. GBrain receipt publication is left for the host under HOST PUBLICATION ONLY.
