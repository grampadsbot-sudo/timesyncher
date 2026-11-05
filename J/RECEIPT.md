# PR #826 / #825 item 11 — host review receipt

Result: partial, uncommitted source candidate. Starting and current HEAD: `e9e299850516b3f6459f641da4d4a492611e4436`. Branch: `vkfill/825-20261105070213`. Model: gpt-6.1-sol. No other model or paid fallback was invoked.

## Change

The existing served list renderer gives the logo/name the free header width. Hotel price and stars form one adjacent group that wraps below a long name and stays right-aligned. Full names remain unclipped; detail headers are unchanged. The served asset was regenerated only with `node scripts/rebake_served_trek_bundle.mjs`.

The failing budget test's local miniTrip inputs now explicitly select the Things into the timeline. Every original missing-flight and optional-price assertion remains. A new negative case confirms that an unpicked flight stays outside price completeness checks. No price gate implementation, protected fixture, checker, workflow, dependency manifest or baseline was changed.

Feature Map: `features/README.md` already links `features/description-as-stored.md`; that entry now records item 11. The existing registered hotel test exercises the served renderer in Chromium, checking complete names, at most two lines, no clipping/overlap, right-aligned stars and an adjacent price. It covers the three requested hotels and Park Central as a shorter-name wrapping case.

## Evidence on the uncommitted candidate based on e9e299850516b3f6459f641da4d4a492611e4436

- Direct `node scripts/test_budget_required_price_completeness.mjs`: exit 0, including all original assertions and the added unpicked-candidate assertion. The original failure was reproduced before editing.
- `node scripts/test_shared_hotels_390_text_wrap.mjs` with installed Chromium: exit 0. A transient replay against the original HEAD asset fails the name/star collision assertion (`hotel-negative-control.log`).
- `test_shared_tab_list_summary`, `test_shared_trip_served_live_tab_mount`, `test_itinerary_fresh_daybyday_bundle`, `test_list_row_description_substance`, `test_budget_timeline_only_rows`, and `test_budget_itinerary_timeline_selected`: exit 0.
- `npm run test:keepsake-style2`: exit 0, including the existing Style one/two contract assertions.
- All seven vacation-client unit files: exit 0 (`client-unit-tests.log`). Direct `shell-layout.mjs`, which runs list/day/budget/detail/keepsake layout suites: exit 0 (`client-shell.log`). The initial `npm test` invocation failed because linked dependency directories were read-only; writable local dependency copies resolved the build environment for the component runs. Generated tracked evidence files were preserved in the job directory and restored byte-for-byte from HEAD.
- Pre-receipt checks: `node scripts/check-no-comments.mjs` exit 0 (1065 files); `node scripts/test_offline_manifest.mjs` exit 0 (402 offline, 18 online); `BASE=vk node scripts/check-code-ratchet.mjs` exit 0 (253 report, 0 fail); `git diff --check` exit 0. Logs: `no-comments-final.log`, `offline-manifest-final.log`, `ratchet-final.log`.

Local browser measurements with the live shared-trip data and candidate assets (`list-geometry.json`): at 390, Motto/TownePlace/Library names use 2/2/1 lines; at 1280 all use one line. Original HEAD uses 3/4/3 at 390 (`initial-list-geometry.json`). The candidate hotel price-to-stars gap is 8px at both widths. Six available list tabs were inspected at both widths; the Events tab was absent. Screenshots and row captures are under `screenshots/`. These are supplementary source checks, not official Gate B or an approved pixel baseline.

Candidate served JS SHA-256: `c3249452dc153e15f9a3cb2ebac033586d008d580856f440fc20b0a036d1742b`.
Source patch: job `PATCH.diff`, SHA-256 `2e878145768f62509c9aa5740c2c10fb8d78a4ae6855651c9d460d4d020d7d2e` (the five source/test/Feature Map files; this receipt is separate).

## Remaining failures and merge verdict

Withhold merge. The published PR head is still e9e299850516b3f6459f641da4d4a492611e4436. Its known CI failure is run `42055282078`, job `127341877110`, `scripts/test_budget_required_price_completeness.mjs:37`, “missing flight price must fail Gate B budget price completeness” (`true !== false`). No CI run was retriggered. This source candidate has not been published or evaluated by exact-head CI.

The complete offline runner was attempted. After local dependency setup it reached its 105th file and stopped at `scripts/test_live_transcript_dialog_pdf.mjs:651`: actual `gbrain-cli-get_page`, expected `bundled-get_page` (`offline-tests-final.log`). A separate clean-PATH diagnostic gets past that assertion but stops at line 861 because `pdftotext` is not installed (spawn status null; `transcript-clean-path.log`). Those unrelated tests and system tools were left untouched. The complete offline suite is not green.

Ubuntu Gate B's current 32-screen structure acceptance and canonical parity command have not run on this unpublished candidate. The host must publish normally, run exact-head CI, and run `~/tsv-gateb/restore_check.py --parity <published-head-sha> --pr 826` through the sanctioned host route. The canonical parity entry fetches Git and writes results outside the supplied directories; this worker did not invoke it under the host-only Git and write boundaries. Holds, quotas, ownership and the shared publication window remain intact. No merge eligibility or certification is claimed.

## Authority and handoff

Read current public PR #826 labels/head/comments, issue #825 and its three scoped comments, and PR review comments. Saved read-only API evidence is in the job directory. Scope comment `6661407805` contains Craig's 7:04 AM PT item 11 ruling. PR remains draft with status:ready, project:tsv and base:vk; no PR or issue state was changed.

GBrain access used: `gbrain get bot-admin/lanes/vk-pr-handoff/pr-826`; mandatory SoTs, verification/keepsake/engineer process skills and the data contract were read through the same CLI route. Context is in `gbrain-context.txt`. The approved-baseline register slug returned page_not_found and repo baselines/manifest.json is absent; no historical NYC image was treated as approved. No pstack, sub-agent, SCT/QA kick, Git metadata mutation, commit, push, merge, rebase, stage, deploy, credential extraction or privileged operation was performed.

All changes are uncommitted for host review. This receipt and a prepared PR description are available in the job directory for host publication; no external message or publication was sent.
