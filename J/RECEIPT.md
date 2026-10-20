# PR #543 — source handoff for host review

Outcome: source-ready, uncommitted, based on actual starting HEAD `477ea3026eece17dd255889341addf87dbf1d49a`. This is a source handoff, not PR acceptance or auto-merge eligibility. Model: gpt-6.1-sol only. No sub-agents, other models, OpenRouter, paid fallback, Git metadata mutation, external messages, PR mutation, merge or deployment.

The worker verified the requested HEAD and an initially clean worktree. Live GitHub read-only GET confirms open PR543, branch `vkfill/335-p3a-wiring-202610190827`, base `migrate/trek-source` at `218a3b39991328c5da4e75601f186065eacbdf45`, no labels. Snapshots: `pr-current.json`, `pr-comments.json`, `pr-reviews.json`, `check-runs.json` in this job directory.

Authority: current user dispatch authorizes the repair while preserving all guards and inherited budgets. GBrain `bot-admin/lanes/vk-pr-handoff/pr-543` and [PR comment6303720948](https://github.com/grampadsbot-sudo/timesyncher/pull/543#issuecomment-6303720948) narrow the repair to list long-description selection/flight truncation while preserving itinerary summaries. The diagnostic's detail-only recommendation was rejected; it was not implemented. Read GBrain `bot-admin/messages/time-syncher/decisions-log`, `skills/vk-thing-data-contract/skill`, engineer process, verification, keepsake QA, visual gate, canonical UI spec and the repo's listed keepsake SoTs. Copies are in this job directory. Direct `gbrain get` succeeds. Published-skill `get_skill vk-thing-data-contract` returned skill_not_found; its suggested catalog route was empty, then the canonical page route supplied the full contract. No access blocker is claimed.

Existing Feature Map coverage: `features/README.md:82` → `features/itinerary-surfaces.md`, plus the stored Details field in `features/detail-page.md`. Governing summary/list field split: GBrain `skills/vk-thing-data-contract/skill`, rows4–5; no new screen or control.

## Root cause and bounded change

At starting HEAD477ea302 and current-base218a3b39, the client list model prefers `override.summary` over `longDetails`. The starting head also tries `detailSummary` first, which follows the same short-field precedence. Flights then pass through the short-line picker. Earlier finalization commit97d98747842c1a6e794bb21e5bf2a8ca2c3cd542 correctly restores shared-trip finalization/logos/airport legs, but does not repair this inherited field-selection behavior. Base/head source snapshots and the earlier diagnostic receipt were read; finalization is retained.

`rowSummary` is shared by Day-by-Day, place helpers and keepsakes. Changing it globally would alter those surfaces. This patch adds `rowDescription` for category list rows and binds only `ListRow` to it. It selects stored longDetails/details and source/place narrative fields, retains the existing generic-description rejection, and does not substitute short summaries or shorten flight narratives. Missing/poor narrative data remains data debt.

Uncommitted source/test files:

- `apps/vacation-client/src/lib/listTabModel.mjs`: list-only narrative selector.
- `apps/vacation-client/src/lib/listTabModel.d.mts`: matching typed declaration.
- `apps/vacation-client/src/components/ListRow.tsx`: renders the list narrative.
- `apps/vacation-client/test/listRows.unit.mjs`: arbitrary split-field regressions across all six categories; full flight narrative; source/place/details fallback; summary-only absence; timeline summary preservation.

Source patch: `source.patch`, SHA256 `4c52bb7c0220b7f19e759575a2d8651c502863810f51e622ac95053587689044`, against starting HEAD477ea3026eece17dd255889341addf87dbf1d49a. No new test file, dependency manifest, CSS, detail panel, fixture, baseline, checker, threshold, allowlist, workflow or deploy-config change. No source write failed.

## Reproduction and saved-input evidence

Pinned input: `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/477ea3026eece17dd255889341addf87dbf1d49a.json`, SHA256 `57e40796c4b6f1935e25776f4bba3b037b4a70e3b097f8729de06195811df262`; read only.

Before repair on477ea302: the list-path assertion fails because Zabar's renders the9-word summary instead of its37-word stored narrative (`description-repro-before.log`). The saved input has exactly11 bound longDetails rows. After the patch, all11 select their exact stored narrative; all11 summaries and all8 days' serialized timeline entries remain identical (`description-before.json`, `description-replay.json`). Examples: JetBlue6→31 words; Zabar's9→37; Carbone9→45. This proves selection, not description quality.

The rendered-app replay serves the unchanged pinned JSON through the existing preview server and normal client finalization. At390 and1280, it finds all11 exact name-plus-description pairs across all six list tabs, with zero horizontal overflow and no page exceptions. Evidence: `saved-input-browser-replay.mjs`, `saved-input-browser-replay-corrected.log`, `saved-input-browser-replay.json`, `screens/saved-input/`. The first job-local attempt matched duplicate hotel names incorrectly; its log is retained as `saved-input-browser-replay.log`. The corrected identity check still requires every one of the11 exact stored narratives at both widths. No product change followed either verification invocation correction.

Local screenshots are UNBASELINED. The repo has no `baselines/manifest.json`; NYC images are historical references, not approved baselines. `comparison.html` pairs the saved477ea302 candidate reference with the uncommitted-source screenshots. Visual spot-checks show the expanded flight narrative on phone and long Carbone text in the desktop row. Local screenshots also show square emoji glyphs and logo-load differences from the saved reference; no pixel-parity or visual acceptance claim is made. Full client-suite artifacts are in `screens/client-suite/`. Its generated tracked detail screenshots were copied to the job and restored byte-for-byte from starting HEAD; final source diff contains no image changes.

## Local verification on477ea302 plus the source.patch above

| Command | Result and evidence |
| --- | --- |
| `node apps/vacation-client/test/listRows.unit.mjs` | exit0; arbitrary split-field and itinerary regressions |
| `npm run typecheck --prefix apps/vacation-client` | exit0 |
| `npm run lint --prefix apps/vacation-client` | exit0 |
| `CHROME_PATH=/home/ubishere9995/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test --prefix apps/vacation-client` | exit0; every unit and shell/list/day/budget/detail/keepsake browser suite; `client-tests-corrected.log` |
| `npm run test:keepsake-style2` | exit0; `keepsake-style2.log` |
| `npm run build` | exit0; root build and bundled vacation-client; `build.log` |
| `node scripts/check-no-comments.mjs` | exit0;805 files; `no-comments.log` |
| `node scripts/test_offline_manifest.mjs` | exit0;273 offline/17 online; `offline-manifest.log` |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | exit0;257 existing reports/0 failures; `code-ratchet.log`; origin/base resolves218a3b39 |
| `git diff --check` | exit0 |

The first aggregate client-test invocation used artifact-root environment variables. Those accidentally forced a browser path inside the runner's negative browser-availability test, causing a local harness assertion. Correcting the command environment resolved it; the second invocation ran all tests without skips or test/check changes. Both logs are retained. No CI was restarted. Dependencies came from unchanged lockfiles via npm ci with scripts disabled and cache in the job directory.

## Acceptance and host action

Existing exact-head CI success is only for starting477ea302: [run39506986361](https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39506986361), unit-tests job118918266882 and secrets job118918266436. It does not certify this uncommitted patch.

No new Gate B run, counter reset, cap extension, qualitative judgment or Craig review was requested. GBrain `bot-admin/lanes/vk-pr-handoff/pr-543` records inherited2GateB failures/0CI failures and the protected-vercel/new-look guards. Those remain in force. The11 newly selected long narratives need the normal managing-dr qualitative judgment; old belowbar receipts for short text are not promoted to acceptance. Stored data gaps and internal notes were not invented away or patched in fixtures.

Host next action: review the four-file uncommitted patch and `PR-DESCRIPTION.md`, then publish only through the authorized host path if its guards permit. The normal host/dispatcher owns exact-new-head CI, guarded Gate B all32 screens, any fresh input judgments, and all publication. Until those complete, this PR has no merge-eligibility or completion verdict from this worker. Do not bypass protectedvercel.json, new-look approval, data/harness holds or quota requirements.
