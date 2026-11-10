# PR #896 / issue #888 — partial host review receipt

Outcome: PARTIAL; do not merge this candidate. Starting and final HEAD: `f2cff426dab747d0ea6f3838e141bda5933295b6`. All source changes are uncommitted for host review. Model: gpt-6.1-sol; one agent; no other models or paid fallback.

## Governing references

Read GBrain `bot-admin/lanes/vk-pr-handoff/pr-896` and canonical `bot-admin/lanes/vk-pr-handoff/pr-888`, `skills/tsv-engineer-pr-process/skill`, `skills/timesyncher-vacation-verification/skill`, `skills/keepsake-qa/skill`, `skills/tsv-qa-visual-gate/skill`, decisions-log and the AGENTS.md SoTs. GBrain access works through the local `gbrain get` CLI; no permission or credential blocker. Current GitHub comments and labels are preserved in the job directory (`comments.json`, `pr.json`). PR has `kickback`, no hold label. The current dispatch authorizes this round. No pstack or additional agents ran.

Feature Map: `features/README.md` → `features/itinerary-surfaces.md` / `features/day-view.md`. No new feature or UI claim of full verification.

## Source change

Only the existing conflict label was adjusted in:

- `src/vacation/trek-live-product-patches.mjs`
- `src/vacation/trek-shared-layout-patches.mjs`
- `public/assets/index-BKun7ofk.js` (served counterpart)

Keep the marker and a shrinking text span on the same flex line. Text wraps inside that span, instead of forcing the marker onto a separate line. Position the 2 px marker at the center of the first text line using the inherited 1.35 line height. This removes one unnecessary line per wrapped conflict label and restores the desktop conflict-marker position. No selectors or CSS blocks were deleted. No tests, guards, tolerances, baselines, workflows, dependency manifests, deployment configuration, data or unrelated component source changed.

Patch evidence: job `proposed.patch` (complete source patch), `source-review.patch` (readable patch-module diff), `candidate-hashes.json`. No failed source writes.

## Check evidence

All local results below apply to the uncommitted candidate based on `f2cff426`, not to a new published SHA.

- `TIMESYNCHER_BUILD_SHA=f2cff426dab747d0ea6f3838e141bda5933295b6 npm run build`: exit 0; `build.log`.
- `node scripts/test_issue_888_clipped_text.mjs`: exit 0.
- `node scripts/test_real_app_entry.mjs`: exit 0; removed tripBadge was already corrected on starting HEAD.
- `node scripts/test_trip_dropdown_human_status_848.mjs`: exit 0; comma date format preserved.
- `npm run test:keepsake-style2`: exit 0.
- `node scripts/test_served_trek_bundle.mjs`: exit 0; served bundle matches patcher.
- `node scripts/test_ui_558_daybyday_time_name_baseline.mjs`: exit 0.
- `node scripts/test_shared_tab_category_css_blast_radius.mjs`: exit 0; `shared-css-check.log`.
- `CHROME_PATH=<installed Playwright chrome-headless-shell> VACATION_CLIENT_LIST_ARTIFACT_ROOT=<job>/client-list-screens node apps/vacation-client/test/list-layout.mjs`: exit 0; `client-list-layout.log` and screenshots at 390/1280.
- `node scripts/check-no-comments.mjs`: exit 0 (1119 files); `no-comments.log`.
- `node scripts/test_offline_manifest.mjs`: exit 0 (431 offline, 18 online); `offline-manifest.log`. No new repo test files.
- `BASE=vk node scripts/check-code-ratchet.mjs`: exit 0, 252 report / 0 fail; `code-ratchet.log`. The checker prepends origin/ to BASE; origin/vk resolves to `54c2390cf73d051113707376743326aeebf05503`. PR base remains `4e0be3fb95bac272671e612bd8df42206c43d534`. No base integration performed.
- `git diff --check`: exit 0.

Setup failures were corrected without source changes: build initially lacked TIMESYNCHER_BUILD_SHA; installed snap Chromium could not launch, so the supported installed Playwright executable was used; the ratchet initially received a SHA where it requires a branch name. No CI reruns or privileged operations.

CI on the exact starting head is already successful: GitHub Actions run `42723508592`, unit-tests job `129523145147`, secrets job `129523144641` (also successful on run `42723499845`). This is not CI evidence for the uncommitted candidate. See job `checks.json`.

## One host capture and local audit

Capture: existing unmodified host `capture/capture.mjs`, all 32 screens, local built frontend, fixed existing b39c6b3 head fixture, at 390/1280. Artifacts: job `host-capture/`, including `capture-manifest.json`, `capture-regions.json` and screenshots. This is local supporting evidence, not official Gate B approval. The stamped SHA identifies the starting HEAD; `candidate-hashes.json` identifies the uncommitted source. Baseline comparisons use `base-4e0be3f-fixture-63ee86d0fbfdba44`; NYC references are not approved baselines. Repository `baselines/manifest.json` is absent.

Host row checker command:
`python3 /home/ubishere9995/tsv-dispatch/bin/vk_row_check.py --cand <job>/host-capture --ref /home/ubishere9995/tsv-dispatch/gateb-cand/base-4e0be3f-fixture-63ee86d0fbfdba44 --issue 888 --json <job>/rowcheck.json`
Result: PASS, no failing rows across 24 list screenshots including flights-390/1280; reference `rowcheck.json`. This helper filters one reason family and is narrower than full Gate B: it does not clear the failure below.

The additional DOM probe (job `conflict-probe.json`) checks Days 1–8 at both widths: all six rendered conflict labels have the marker on their first text line; label text fits; document width equals viewport width throughout. Day 3 shows “Conflict with Afternoon matinee show” in full; screenshots `day3-390.png`, `day3-1280.png`. The broad overflow diagnostic also records a pre-existing ancestor overflow from header decoration; it does not assert the whole page has no clipped text.

Pixel audit (`pixel-audit.json`, same threshold 0.1 as the recorded compare): daybyday-1280 and daybyday-1280-top have zero changed pixels against PR base. At 390, daybyday full height is 1885 vs base 1855 (previous rejected candidate was 1915): remaining height is wrapped conflict text. The previous 136 px desktop conflict-marker discrepancy is removed. Flights remain unchanged by this round: full ratios 0.024762 at 390 and 0.002847 at 1280; desktop top ratio 0.002843. Events screenshots also show image acquisition differences (422 full-image pixels) although event source is untouched; left outside scope.

## Close verdict: do not merge; gates unresolved

The deterministic structure audit uses the existing host checker in structure mode, without changing any check configuration or invoking a model; see job `structure-audit.json` (32 screens). It does not produce official Gate B approval and records these unresolved requirements:

1. Flights-390 and flights-390-top: Southwest row logos are 3.0 px high (tolerance 2 px) under the full check's `logo not vertically centred` reason. The narrow host row helper reports PASS because it filters `not centred with name` reasons. Do not treat that helper as full Gate B.
2. 1280 capture records ERR_NETWORK_CHANGED for fonts.googleapis.com and unpkg.com/leaflet.css; page-error checks fail. No capture rerun or resource workarounds applied.
3. Description judgments remain pending under the existing qualitative acceptance rules. This local audit intentionally invokes no replacement judge and does not clear any inherited data/quality holds.
4. The chief's requirement for pixel-identical 1280 Flights conflicts with the inherited change that reveals previously absent arrival-time text there. The recorded Gate B run `20261109-230722` and this capture both show it. This round restores desktop day-by-day equality but does not hide flight times to meet pixels. Exact next host decision: clarify whether desktop arrival-time visibility or strict base parity governs; then issue one scoped flight alignment/desktop repair if needed.
5. Official Gate B approval for a published candidate and tip==live are not achieved. Live `/api/version` is `54c2390cf73d051113707376743326aeebf05503` (`live-version.json`), not PR head `f2cff426`.

Existing rejection reference: PR #896 comment `6753915158`, Gate B run `20261109-230722`. Do not merge or declare auto-merge eligibility on this evidence. No second implementation/screenshot iteration was run.

## Host handoff

Uncommitted source files are the three listed above; `J/RECEIPT.md` is the uncommitted receipt. Job `PR-DESCRIPTION.md` is proposed publication text only. No commit, staging, push, merge, rebase, Git metadata mutation, deployment, GitHub/GBrain write, Craig message, NYC data write, or gate/ownership change was performed. The outer host owns publication and subsequent gate handling.
