# PR543 — partial source repair; host review required

Outcome: acceptance blocked by remaining logo failures and exact-new-head gates; reference: saved Gate B run `pr543-477ea30`, GBrain `bot-admin/lanes/vk-pr-handoff/pr-543`, actual starting HEAD `84fb09a26e79829cea926e0082d92755f5264b48`. The two-file source/test repair below is uncommitted. This is not a PR completion, close action, Gate B verdict or auto-merge eligibility claim.

## Identity, authority and ownership

Verified the required starting HEAD before edits; worktree initially clean. Read-only GitHub GET confirms PR543 open on `vkfill/335-p3a-wiring-202610190827`, base `migrate/trek-source` at `218a3b39991328c5da4e75601f186065eacbdf45`, no labels. Final GitHub read still shows the same PR head. Snapshots: `pr-current.json`, `pr-comments.json`, `pr-reviews.json`, `check-runs-final.json` in this job directory.

Read the current handoff first, all current PR comments, the decisions log, the engineering process, verification, visual gate, Thing data contract, keepsake QA and the repo-required keepsake SoTs. GBrain copies are saved as `gbrain-*.md`. Direct `gbrain get bot-admin/lanes/vk-pr-handoff/pr-543` succeeds; no GBrain access failure is claimed. The CLI reports an unrelated read-only audit-file warning and still returns the pages; no privileged retry was attempted.

The list-description repair required by comment6303720948 is already in starting84fb09a2 and is retained. This dispatch's named airport-control failure is the only runtime behavior changed. The named logo failures were investigated without rewriting inputs. No pstack or sub-agents were loaded; model gpt-6.1-sol only, no other model, OpenRouter or paid fallback.

No Git metadata was changed or tested for writability. No staging, commit, push, merge, rebase, cherry-pick, PR mutation, external message, deployment, sudo, chmod, credential extraction or out-of-root write was performed. All publication and GBrain filing remain with the outer host. No source write failed.

## Root cause and source change

The saved477ea302 capture already contains both airport timeline titles, but neither appears in its controls inventory. The same-input staging capture contains both as controls. Source `DayTimeline.tsx` renders every travel entry as a plain span, even when the entry has its bound flight. Earlier finalization97d9874 restores the data and generated airport legs; it cannot repair this separate rendering branch. Reproduced before the runtime change: `airport-control-before.log` exits1 with `Travel to airport must open Thing details at 390px` on starting84fb09a2 plus the added regression.

The runtime change removes the blanket travel exclusion from the existing detail-button branch. Entries with a bound Thing now use the existing `onOpen(place)` handler. Travel entries without a Thing remain plain text. No new handler, data, timing, itinerary row, CSS, summary or renderer is introduced. Feature Map: `features/README.md` → `features/day-view.md`, which says timeline rows open Thing details and travel rows omit repeated summaries.

Uncommitted source/test files:

- `apps/vacation-client/src/components/DayTimeline.tsx`: restore bound airport rows' existing detail action.
- `apps/vacation-client/test/day-layout.mjs`: assert both controls exist and open their bound flight at390 and1280; retain the existing layout checks.

`source.patch` SHA256: `e4dfc34ee81120231018436362b951d9e26e90f49db401fc0d98b1d1c5dfab4c`, against starting84fb09a26e79829cea926e0082d92755f5264b48. No new test file; the existing browser test remains called by `shell-layout.mjs`. No fixture, snapshot, baseline, reference original, checker, allowlist, threshold, workflow, dependency manifest or deploy-config edit.

## Remaining logo failures — do not merge on this receipt

Read-only saved-input route: `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/477ea3026eece17dd255889341addf87dbf1d49a.json`, SHA256 `57e40796c4b6f1935e25776f4bba3b037b4a70e3b097f8729de06195811df262`. Saved candidate and same-input staging inventories are compared in `saved-failure-diagnosis.json`, including source paths and SHA256s.

Saved Gate B run `pr543-477ea30` reports real failed direct logo loads for Open-air bus tour candidates, Statue of Liberty / Ellis Island tour candidate, Village Vanguard, Hilton Club New York and Hotel Belleclaire Central Park. Its staging comparison uses Google S2 favicon URLs for those five, while the candidate uses the stored brand-domain `/favicon.ico` values. The inputs also record logo capture failure reasons. No working alternate bound URL for the persistent failures was found in these stored records.

Fresh local reproduction command: `node /home/ubishere9995/tsv-work/vkfill-543-20261020161728-job/saved-input-replay.mjs`, on starting84fb09a2 plus the source.patch above. It serves the unchanged pinned JSON through the existing preview server and normal client finalizer. At both390 and1280, these actual rendered image sources still have natural dimensions0x0:

- `https://www.bigbustours.com/favicon.ico`
- `https://www.statuecruises.com/favicon.ico`
- `https://www.hilton.com/favicon.ico`

Village Vanguard and Hotel Belleclaire load in this local replay without any URL or source change; this does not erase their saved Gate B failures. Evidence: `saved-input-replay.json` and `.log`. This diagnosis does not claim a fresh DATA-CONTRACT or Gate B verdict.

GBrain routes checked before this blocked acceptance report: `skills/vk-thing-data-contract/skill` (data failures belong to the data route, not UI/fixture text patches), `bot-admin/requests/eggbot-vk-336-rebuild-prep-20261017` G11/G17 (consume bound image URLs; do not restore guessed Google favicon chains), and `bot-admin/requests/eggbot-logo-good-enough-20261019-0836` (forensic provenance relaxed, broken/wrong/invented images still disallowed). The newer ruling is honored; lack of logoProvenance is not the blocker. No guessed fallback, generic logo, blank-to-pass handling or fixture substitution was added.

Host/data owner next action: repair or supply working logo data through the existing authorized persistence/recapture route, then use the normal guarded exact-head dispatcher. Fixture edits, new source discovery, new-look approval and checker changes are outside this source slice. No PR close or merge was performed.

## Verification on starting84fb09a2 plus source.patch

- Targeted browser regression after fix: exit0, `airport-control-after.log`; both airport controls open the correct flight at390 and1280, with the existing day layout checks. Before fix: exit1 as documented above.
- Pinned saved-input browser replay: exit0, `saved-input-replay.json`; both airport controls open the correct Southwest flight at both widths, zero horizontal overflow and no page exceptions. Logo failures are recorded separately and preserved.
- `node apps/vacation-client/test/listRows.unit.mjs` and `node apps/vacation-client/test/dayTimeline.unit.mjs`: exit0 (`listRows-unit.log`, `dayTimeline-unit.log`). These model checks ran before the one-condition runtime edit; model code is unchanged.
- `npm run typecheck --prefix apps/vacation-client`: exit0 after fix (`client-typecheck-after.log`).
- `npm run lint --prefix apps/vacation-client`: exit0 (`client-lint.log`).
- `npm run test:keepsake-style2`: exit0 (`keepsake-style2.log`).
- `npm run build`: exit0 (`build.log`); existing bundle-size warning only.
- Required pre-DONE checks after source edits: `node scripts/check-no-comments.mjs` exit0,805 files; `node scripts/test_offline_manifest.mjs` exit0,273 offline/17 online; `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` exit0,257 reports/0 failures; `git diff --check` exit0. Logs are in this job directory.

The screenshot verification round includes the existing day fixture and the unchanged pinned input at390 and1280. Artifacts: `screens/day/`, `screens/saved-input/`, and `comparison.html` with copied saved-candidate before references. The approved `baselines/manifest.json` is not present; all local screenshots are UNBASELINED. No pixel-parity, full visual acceptance or Gate B claim. Existing broken images, missing emoji glyphs and clipped phone conflict text are visible and were left outside this source change.

Exact starting-head CI is now green: [run39514005552 / unit-tests118941660813](https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39514005552/job/118941660813), secrets118941660673; parallel existing run39514000231 also completed successfully. No CI run was restarted or triggered by this worker. These checks do not certify the uncommitted patch.

No new Gate B run, qualitative judgment, cap extension or counter reset was requested. Inherited limits/holds, protected vercel.json and new-look approval remain as recorded in GBrain `bot-admin/lanes/vk-pr-handoff/pr-543`. Outer host review/publication, CI on any published new head and all32-screen Gate B acceptance are still required. The partial source repair must not be treated as the job's acceptance verdict.
