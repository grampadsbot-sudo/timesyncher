# PR #896 / issue #888 — host vk base-merge @ `fcdd2d24` (merge f8d4748)

**Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY). **Starting HEAD:** `fcdd2d242cfc1b7ab9374b50af8de6f3e564174e`. **Merged base:** `origin/vk` @ `f8d4748f8ea8104e8722fecaa383588d5d7b010c`. **Model:** composer-2.5.

## This round (conflict resolution)

| file | resolution |
| --- | --- |
| `public/assets/index-BKun7ofk.js` | vk index version, then `node scripts/rebake_served_trek_bundle.mjs` → sha256 `0618a3819da9dc864ef7cadae5d17be68fb6095cc7a67bae85c5756e823ff032` |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Both sides: #888 flights @390 fix receipt + vk #884 logo-fallback + #927/#925 carry |
| Product | `apps/vacation-client/src/styles.css` @390 multi-row `.tsv-row-flight-main` (no logo-chip `margin-top`) unchanged on branch |

## Checks @ `fcdd2d24` + conflict resolution (uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `0618a3819da9dc864ef7cadae5d17be68fb6095cc7a67bae85c5756e823ff032` |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS (after root + client `npm ci`) |
| `VACATION_CLIENT_LIST_ARTIFACT_ROOT=…05314-job/client-list node apps/vacation-client/test/list-layout.mjs` | PASS @390/1280 Flights; screenshot `vkfill-896-20261110005314-job/client-list/flights-390.png` |
| `npm run test:keepsake-style2` | PASS |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | PASS |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1136 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (442 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-hardcoded-content.mjs` | PASS |
| `git diff --check` | PASS |

**Uncommitted:** `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js` (+ staged merge index from host).

**Host:** `git add` resolved paths + staged merge index; `git commit --no-edit`; push `vkfill/888-20261109142715`; Gate B with `gateb-allow.json["888"]`.

---

# PR #896 / issue #888 — host vk base-merge `J/RECEIPT.md` @ `f82bc721`

**Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY). **Starting HEAD:** `f82bc721ffa520f9e02ee5c669c89bc41c957cc1`. **Merged base:** `origin/vk` @ `86d90ed131c3ad519ec98a42afcdc692edcfa40e` (`basemerge.json` in job dir). **Model:** composer-2.5.

## This round

Host merge conflict: `J/RECEIPT.md` only. Product #888 flights @390 fix already on `f82bc721` (`apps/vacation-client/src/styles.css`: multi-row flight grid @390, no logo-chip `margin-top`; times `grid-column: 2` with `min-width: max-content`). Staged merge index carries vk #929/#925 slices; no rebake required (no `public/assets/*.js` conflict).

| check | result |
| --- | --- |
| `cd apps/vacation-client && npm test` | PASS (`f82bc721` tree) |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS |
| `VACATION_CLIENT_LIST_ARTIFACT_ROOT=…/vkfill-896-20261110001318-job/client-list node apps/vacation-client/test/list-layout.mjs` | PASS @390/1280 Flights (no row overflow; logo ink OK) |
| `node scripts/check-no-comments.mjs` | PASS (1135 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (441 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-hardcoded-content.mjs` | PASS (88 report, 0 fail) |
| `git diff --check` | PASS (no conflict markers) |

**Uncommitted:** `J/RECEIPT.md` (conflict resolved), `J/PR_DESCRIPTION.md` (restored #888 text; staged index had vk #927 copy). **Staged (host merge index, do not drop):** vk #927 hero/splitter, budgetModel, `offline-tests.txt`, etc. per `git status`.

**Host:** `git add J/RECEIPT.md`, `git commit --no-edit`, push `vkfill/888-20261109142715`; official Gate B with `gateb-allow.json["888"]` on published SHA.

---

# PR #896 / issue #888 — flights @390 defects A+B (chief dr round @ `46172253`)

**Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY). **Starting HEAD:** `46172253924650513d27b73a52109cdbea7ba294`. **Model:** composer-2.5.

## Problem restatement (before fix)

**Defect A — arrival time clipped @390:** In `@media (max-width: 480px)`, `.tsv-row-flight-main` forced a single row with five columns (`grid-template-columns: auto minmax(0,1fr) auto auto auto; grid-template-rows: auto`), packing logo, title, price, depart, and arrive on one line. With `.tsv-row-main { overflow: hidden }` on the card, the second `.tsv-row-flight-time` (arrive) extends past the card and is cut off (e.g. `4:35 pr`).

**Defect B — fallback glyph over logos @390:** The same block added `.tsv-row-flight-main > .tsv-logo-chip { align-self: start; margin-top: calc(0.5lh - 11px) }` to optically align the chip with wrapped airline names. That offset breaks logo-chip pixels vs base `1ffd23c`: the grey ✈️ fallback layer reads on top of loaded brand logos in Gate B captures.

## Fix

`apps/vacation-client/src/styles.css` (@390 only): restore vk multi-row flight grid (`grid-template-columns: auto minmax(0,1fr) auto; grid-template-rows: auto auto auto auto`), remove logo-chip `margin-top` / single-row five-column grid, place times with `grid-column: 2; justify-self: end` (`min-width: max-content`, no ellipsis). Dropped @390 flight-name wrap override so logo chips match base `1ffd23c` frame (`list-layout` ink ≤0.5px); served trek #888 name wrap unchanged in bundle CSS. Global flight rules (1280 pin) untouched.

## Checks @ `46172253` + uncommitted patch

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1132 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-hardcoded-content.mjs` | PASS |
| `node scripts/offline-tests.txt` full sweep | **FAIL** `scripts/test_live_transcript_dialog_pdf.mjs:651` `gbrain-cli-get_page` !== `bundled-get_page` (env harness; out of #888 scope) |
| Flights tab DOM (vacation-client preview, NYC PR225) | `list-layout.mjs`: no horizontal overflow @390/1280; logo ink pass @390 Flights. Screenshot: `vkfill-896-20261109234319-job/flights-390.png`. Times in col 2 rows (not clipped on card edge); no @390 logo-chip margin. |

**Host:** `git add J/RECEIPT.md apps/vacation-client/src/styles.css` (+ staged merge index for vk chat-itinerary if completing merge); do **not** stage `evidence/*` from local test runs. Finish merge commit; push `vkfill/888-20261109142715`; official Gate B with `gateb-allow.json["888"]`.

---

# PR #896 / issue #888 — CI unit-tests fix + vk base-merge `J/RECEIPT.md` conflict

**Outcome:** SOURCE-READY for host commit (merge completion). **Starting HEAD:** `63e5d083c758d1d16e0e335f867683f405dd966c`. **Merged base:** `origin/vk` @ `1ffd23ca895d39db3ea28eff62c7e02279881557` (host basemerge). **Model:** composer-2.5; HOST PUBLICATION ONLY.

## This round (chief dr eggbot CI fix @ `63e5d083`)

| change | why |
| --- | --- |
| `vacation-app.html` | Restored base `vk` chat-send `catch` block (`showComposerStatus(customerSafeErrorMessage`, `tsTyping` remove, AbortError bubble, `stopProgressPoll`) verbatim from `git show origin/vk:vacation-app.html`; dropped `handleChatSendFailure(...)` delegate that made `scripts/test_reply_action_claim_d2_paia_save_route.mjs` RED on CI head `63e5d083`. **#888** switcher/flight/conflict CSS unchanged. |
| `J/RECEIPT.md` | Removed merge conflict markers; kept both sides' historical receipts below. |

| check | result @ uncommitted tree |
| --- | --- |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS (after root `npm ci`) |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS (after root + client `npm ci`) |
| `node scripts/check-no-comments.mjs` | PASS (1132 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `git diff --check` | PASS (no conflict markers in product files) |

**Host:** resolve `J/RECEIPT.md` UU, `git add vacation-app.html`, complete merge commit (`git commit --no-edit`), push `vkfill/888-20261109142715` once; CI must green including `unit-tests` on published SHA. Official Gate B queue remains on prior published head until host publishes this merge.

---

## Inherited — PR #896 / issue #888 — host vk base-merge conflict resolution (ce649c0 → c5ac2c57)

**Outcome:** SOURCE-READY for host commit (merge completion). **Starting HEAD:** `c5ac2c57b28980eb2535697829e16a22dcd72659`. **Merged base:** `origin/vk` @ `ce649c0cde4e7ecac6dc0138e2dddd5cc523ecde` (`basemerge.json` in job `vkfill-896-20261109210939-job`). **Model:** composer-2.5; HOST PUBLICATION ONLY — no commit, stage, push, or Git metadata write by this round.

## Conflict resolution

Host merge left three conflicts: `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js`, `scripts/offline-tests.txt`.

| File | Resolution |
| --- | --- |
| `scripts/offline-tests.txt` | Both sides: `test_issue_888_clipped_text.mjs` (PR #896) and `test_issue_901_trip99_single_venue_standins.mjs` (vk). |
| `public/assets/index-BKun7ofk.js` | Took vk index side for conflict hunk, then `node scripts/rebake_served_trek_bundle.mjs` (full rebake from product patcher). |
| `J/RECEIPT.md` | Both sides: this round header plus inherited #896 and vk receipts below. |

Product behaviour: PR #888 clipped-text / switcher / flight-row / conflict-card rules on branch head, plus vk rebrand, dossier overlay, Trip 99 fixture rows, and related staged merge sources.

## Checks (uncommitted tree @ c5ac2c57 + resolutions)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `56dadc233c00f6d24d4ca70dbd818a7cc4e38f1a583209f898f6dc1ab51cc82c` |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node apps/vacation-client/test/list-layout.mjs` | PASS (after `npm ci` root + `apps/vacation-client`) |
| `node scripts/test_real_app_entry.mjs` | PASS (after root `npm ci`) |
| `node scripts/test_trip_dropdown_human_status_848.mjs` | PASS |
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS |
| `npm run test:keepsake-style2` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1130 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (438 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **FAIL** `FILE-SIZE-500` `vacation-app.html` `lines:886>872` (vk merge growth; baseline not updated — host owns `scripts/code-ratchet-baseline.json`, out of lane scope) |
| `git diff --check` | PASS (no conflict markers in resolved files) |

**Verdict:** Conflict resolution SOURCE-READY; host commit blocked on code ratchet until baseline records `vacation-app.html` line count ≥886 (merged vk + branch). No new #888 product edits this round. Re-run official Gate B on published post-merge SHA (`handoff/pr-896`).

## Host handoff

- Uncommitted: conflict resolutions above plus this `J/RECEIPT.md`.
- Host: `git add` conflicted paths, `git commit --no-edit`, push `vkfill/888-20261109142715` once, re-run CI and official Gate B on published SHA.

---

# PR #896 / issue #888 — containment repair, host publication only

Starting and final HEAD: `6dafbb249baa787fec0a9e3cf971c3100b0527b8`. Source remains **uncommitted for host review**. No Git metadata mutation, publication, deployment, PR comment, model delegation, OpenRouter or paid fallback occurred.

## Verdict

**PARTIAL / DO NOT MERGE this candidate.** Reference: starting HEAD `6dafbb249baa787fec0a9e3cf971c3100b0527b8`, inherited Gate B run `20261110-035124`, and this job's `pixel-compare/summary.json` / `structure-check/summary.json`. This round fixes the authorized 4:30 PM PT conflict-card containment addendum, but does not clear #888's complete acceptance bar. The host must retain all existing gates and holds; do not treat the DONE marker as merge approval.

## Source change and cause

`src/vacation/trek-live-product-patches.mjs`: change only the existing conflict-card width from `100%` to `auto`. Its 26px left margin was added outside the 100% width, pushing the card and label beyond the containing timeline row. Auto width lets block sizing account for that margin, borders and padding. Full conflict text continues to wrap. Rebuilt `public/assets/index-BKun7ofk.js` with the existing product patcher; no new renderer or export path.

Served asset SHA-256: `eaeb30166bf8293536ff076b1f2f6908a605fa5aec2a2b7dae1f2c875a13171d`. Reviewable product patch: `/home/ubishere9995/tsv-work/vkfill-888-20261109195814-job/source.patch`. Existing Feature Map entries: `features/README.md` Day view and `features/day-view.md` timeline rows. No new UI feature or verified-live claim.

## Evidence on starting HEAD plus this uncommitted patch

- Browser regression command: `PLAYWRIGHT_BROWSERS_PATH=/home/ubishere9995/.cache/ms-playwright node /home/ubishere9995/tsv-work/vkfill-888-20261109195814-job/conflict-containment.mjs`. It renders the original HEAD asset as a control and the modified served asset, using the identical host fixture. Days 1–8 at 390/1280: **6 overflowing conflict cards before, 0 after**, 6 conflict occurrences checked, 32 before/after day-width states. Every patched 390 state has document width 390. Evidence: `conflict-containment.json`.
- `node scripts/test_issue_888_clipped_text.mjs`: exit 0.
- `node scripts/test_served_trek_bundle.mjs`: exit 0; served bundle matches existing patcher.
- `npm run test:keepsake-style2`: exit 0.
- `node scripts/test_real_app_entry.mjs`: exit 0.
- `node scripts/test_trip_dropdown_human_status_848.mjs`: exit 0.
- `CHROME_PATH=/home/ubishere9995/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome VACATION_CLIENT_LIST_ARTIFACT_ROOT=/home/ubishere9995/tsv-work/vkfill-888-20261109195814-job/client-list node apps/vacation-client/test/list-layout.mjs`: exit 0, including Flights at 390/1280; no test tolerance changed.
- `TIMESYNCHER_BUILD_SHA=6dafbb249baa787fec0a9e3cf971c3100b0527b8 npm run build`: exit 0 (`build.log`). This labels a local build of uncommitted source; it is not a new published head. Initial build without the required SHA failed; supplying the documented build environment resolved that local setup issue.
- `node scripts/check-no-comments.mjs`: exit 0, 1121 files (`no-comments.log`). Initial attempt lacked client TypeScript dependencies; restored dependencies without changing manifests or lockfiles.
- `node scripts/test_offline_manifest.mjs`: exit 0, 433 offline / 18 online. No new repository test file.
- `BASE=vk node scripts/check-code-ratchet.mjs`: exit 0, 252 report / 0 fail (`ratchet.log`). Initial BASE supplied as a commit was invalid for the checker, which resolves `origin/<BASE>`; corrected to the actual PR base branch, `vk`.
- `git diff --check`: exit 0.

## One host capture round and outstanding gates

Host `capture/capture.mjs` ran unchanged against the local production build, original font configuration and fixture `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/6dafbb249baa787fec0a9e3cf971c3100b0527b8.json`, with output only inside this job. `capture.log`: 32 shots, 0 capture failures. Capture metadata labels starting HEAD; actual candidate is HEAD plus the recorded uncommitted patch. Before reference: `base-5a67b4f-fixture-d406b573a5d68b38`; NYC historical references are not approved baselines.

The unchanged host pixel comparator's `compare` function ran with its standard thresholds and `no_vision=True`. It was called directly so there was no model fallback, external share upload, label or PR publication. Evidence: `pixel-compare/summary.json` and adjacent side-by-side/diff images.

- `daybyday-390.png`: FAIL, ratio **0.171633** (17.1633%), versus inherited run `20261110-035124` **0.163554**. Fixing containment narrows conflict-card content and increases legitimate wrapping; it does **not** resolve the pixel-reflow rejection.
- `flights-390.png`: FAIL, ratio **0.024762**, unchanged from inherited run. Flight source is untouched this round.
- Flights at 1280 and the affected top captures remain NEEDS_JUDGMENT. Day-by-Day at 1280 is 0 changed pixels against base.
- The four Events captures also have small differences (ratios 0.000185–0.000450) despite no Events product edits. They remain NEEDS_JUDGMENT; no recapture, mask or allowance was used.

`vk_row_check.py` exit 0 (`rowcheck.json`, 24 list captures including Flights 390/1280). **This is insufficient for merge:** the full structure check reports 13 of 32 screens unresolved (`structure-check/summary.json`). Two flight captures include named failures: Southwest logos 3.0px high at 390 against 2px tolerance. Remaining reasons concern missing/invalid managing-dr description-quality receipts; no substitute model judgments were generated. The narrow rowcheck matches a different reason string and does not clear those full-structure failures.

CI read-only snapshot on the unchanged published HEAD `6dafbb249baa787fec0a9e3cf971c3100b0527b8`: unit-tests check `129589773710`, secrets `129589774083`, Vercel Preview Comments `129589782377` all success. There is no CI run for the uncommitted candidate and no tip==live proof.

## Scope, authority and host next action

Read GBrain `bot-admin/lanes/vk-pr-handoff/pr-896`, canonical `bot-admin/lanes/vk-pr-handoff/pr-888`, `bot-admin/messages/time-syncher/decisions-log`, all AGENTS.md SoTs, and the engineer, keepsake, vacation-verification and visual-gate skills; snapshot `governing-pages.txt`. Read current PR comments/labels/checks through public GitHub API; snapshots are in this job. Only kickback was labelled. The latest comment `6758582150` also requests inclusion of current vk; GitHub reports mergeable=false / dirty. Any branch reconciliation belongs to the host under the current no-merge/no-Git-write runner rules.

Do not merge this candidate: it leaves the current day-view/flight visual rejection and the full-structure failures unresolved. Host/managing dr must review this narrow containment patch, reconcile the current base using host-owned Git operations, and issue the next targeted diagnosis for the remaining flight alignment/reflow and description-judgment prerequisites. No new coder round, gate change or data write is authorized by this receipt.

Untouched: #884/#882/#889/#865 source, NYC stored data/fixtures, baselines/references, Gate B/capture scripts, ratchets/thresholds/allowlists, offline test classification, dependencies/lockfiles, deploy configuration and secret/environment files. Dependencies were installed only inside the supplied worktree, with npm cache in `/tmp`.

---

## Inherited receipt (historical; not evidence for this round)

# PR #896 / issue #888 — host vk merge conflict resolution

**Outcome:** SOURCE-READY for host commit (merge completion). **Starting HEAD:** `4c5c7ed2f0e548ceb70523958d2cbf7c2eecb547`. **Merged base:** `origin/vk` @ `5a67b4fc90c1e579381b02dbf94396a0d72ce9b8` (host `basemerge.json`). **Model:** composer-2.5; HOST PUBLICATION ONLY — no commit, stage, push, or Git metadata write by this round.

## Conflict resolution

Host merge left one conflict: `J/RECEIPT.md`. Resolved by keeping **both** sides: this #896 handoff plus the inherited vk #889 dossier-overlay receipt section below. Product behaviour: PR #888 clipped-text / switcher / flight-row rules on branch head, plus vk street-address and dossier-overlay changes from the staged merge index.

Served bundle: `public/assets/index-BKun7ofk.js` unchanged by `node scripts/rebake_served_trek_bundle.mjs` (sha256 `fdb62e27…`, `node scripts/test_served_trek_bundle.mjs` exit 0).

No additional #888 product source edits were required on `4c5c7ed2`; prior head already carries vacation-client flight-row CSS (`apps/vacation-client/src/styles.css` @390 `nowrap` time chips, name wrap, `margin-top: calc(0.5lh - 11px)` logo) and trek conflict-label wrap patches.

## Check evidence @ `4c5c7ed2` (+ merge index, uncommitted receipt only)

| Command | Result |
|---|---|
| `node apps/vacation-client/test/list-layout.mjs` | pass (390/1280; JetBlue row logo ink within tolerance) |
| `node scripts/test_issue_888_clipped_text.mjs` | pass |
| `node scripts/test_real_app_entry.mjs` | pass |
| `node scripts/test_trip_dropdown_human_status_848.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | pass (vk merge regression) |
| `node scripts/check-no-comments.mjs` | pass (1121 files) |
| `node scripts/test_offline_manifest.mjs` | pass (433 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (252 report, 0 fail) |

`npm ci` at repo root was run once to restore `@neondatabase/serverless` for `test_real_app_entry.mjs`; no `package.json` / lockfile edits.

## Staged merge index (host owns `git add` + commit)

From vk @ `5a67b4fc`: dossier overlay / intake presentation, fixture address and flight-route rows, offline tests `test_vkprloop_*`, `scripts/offline-tests.txt` rows, and related sources per diff stat (`git diff --cached --stat`). **Left outside this round:** Gate B capture, deploy, NYC live data writes, baselines, check config.

## Host handoff

- Uncommitted: `J/RECEIPT.md` (this file).
- Host: complete merge commit (`git commit --no-edit` after conflict mark removal), push `vkfill/888-20261109142715`, re-run CI and official Gate B / rowcheck on the **published** SHA (not Cursor self-proof).

## Prior #896 partial receipt (GPT round @ `f2cff426` — superseded for merge gate)

Earlier partial noted Southwest logo 3px vs 2px tolerance on full Gate B flights-390 and pending official gate approval. This conflict round does not re-run host capture; host must re-validate gates on the post-merge commit.

---

# Inherited from vk merge — PR #892 / #889 street addresses + dossier overlay

**vk HEAD at merge:** `5a67b4fc90c1e579381b02dbf94396a0d72ce9b8`

## Changes (in staged merge index)

Dossier overlay, fixture address/flight rows, offline `test_vkprloop_*` rows — per `git diff --cached --stat` on earlier merge rounds.

---

# PR #922 — host base-merge conflict resolve @ `578510a2` (inherited from `origin/vk`)

# vkfill-925 — chat edit sequential PUT merge @ `1ffd23ca`

# PR #929 / Issue #927 — host base-merge + Gate B round 1 @ `6b92b55d`

# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `7441bc9688c4ef6292f8bc696b78b8f490c04be8` (verified at round launch).

**Host base merge:** `origin/vk` at `86d90ed131c3ad519ec98a42afcdc692edcfa40e` into `7441bc96` (per brief). **Conflicts resolved this round:** `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` (both sides kept). Staged vk tree: #927 splitter/hero, budget price parity, #925 chat itinerary edit. No `public/assets/*.js` merge conflict; served bundle unchanged (`test_served_trek_bundle.mjs` PASS).

---

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources on branch)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (prior round). |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide `.tsv-logo-fallback` on successful load; show `display:grid` on final failure. |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |

## vk carry from merge (`origin/vk`)

| area | files |
| --- | --- |
| #927 — finger drag + hero | `public/vacation-app-request.js`, `public/ts-trip-hero-collapse.js` (mobile-only mount ≤844px), `vacation-app.html`, `shared-app.html`, splitter CSS, `scripts/test_vacation_app_927_*.mjs` |
| Budget price parity (#929 round) | `apps/vacation-client/src/lib/budgetModel.mjs`, `apps/vacation-client/test/budget.unit.mjs` |
| #925 chat edit | `src/vacation/chat-itinerary-edit-day.mjs` (`mergeStoredChatItineraryScheduleOverride`), `scripts/test_chat_itinerary_edit*.mjs` |

### vk carry — chat edit sequential PUT merge

| Path | Behaviour kept |
| --- | --- |
| `src/vacation/chat-itinerary-edit-day.mjs` | `mergeStoredChatItineraryScheduleOverride` deep-merges schedule onto stored override before PUT. |
| `src/vacation/chat-itinerary-edit.mjs` | `persistItineraryWrite` passes `payload.thingOverrides` into put-body builder. |

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

## Gate B / screen_probe (#884)

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

`hold:test-trip-fixture` — places[23] Marriott `logoUrl` replay vs live is a **data/harness fault**, not a #884 UI stacking fix.

## Local proof (@ `7441bc96` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | PASS |
| `node apps/vacation-client/test/budget.unit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (441 offline, 19 online) |
| `env BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (1135 files) |

No CI run id on this uncommitted tree; pending host merge commit + one push to `vkfill/884-20261109123208`.

## Host publish

1. `git add` resolved `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, and staged vk merge index; `git commit --no-edit` or single publish commit on `vkfill/884-20261109123208`.
2. Push once; exact-head CI + Gate B per handoff `pr-885`.
3. Post-deploy: `node scripts/test_vacation_app_927_webkit_touch_live.mjs` when WebKit URL available.

## Not touched

# Issue #927 — iOS touch splitter + collapsible trip hero @ `1ffd23ca` (prior round summary)

**Outcome:** host-published on `6b92b55d`. **Lane:** cursor-ubuntu, composer-2.5.

| area | files |
| --- | --- |
| Task A — finger drag | `public/vacation-app-request.js` (`bindSplitter`: 44px row/handle, non-passive touch listeners, full-screen `splitterDragShield`, iframe `pointer-events` during drag); `vacation-app.html`, `public/vacation-app-shell.css`, `public/brand/vk-wordmark.css` |
| Task B — hero collapse | `public/ts-trip-hero-collapse.js`; `shared-app.html` script include |
| Tests | `scripts/test_vacation_app_927_touch_splitter.mjs`, `scripts/test_vacation_app_927_hero_collapse.mjs`, `scripts/test_vacation_app_927_webkit_touch_live.mjs`; manifest rows in `scripts/offline-tests.txt` + `scripts/online-tests.txt` |

---

# vkfill-925 — chat edit sequential PUT merge @ `1ffd23ca` (`origin/vk`)

Merge-on-put: `mergeStoredChatItineraryScheduleOverride` (`src/vacation/chat-itinerary-edit-day.mjs`). Tests: `scripts/test_chat_itinerary_edit_905.mjs`.

---

# PR #922 — host base-merge conflict resolve @ `578510a2`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `578510a284ac0081e7ad40a99820ee0a5e6013f1` (verified). **Lane:** cursor-ubuntu, composer-2.5. Host merged `origin/vk` at `ce649c0cde4e7ecac6dc0138e2dddd5cc523ecde` (chief `basemerge.json` dirty-head requeue).

## Conflict resolution

| file | resolution |
| --- | --- |
| `scripts/offline-tests.txt` | Kept **both** `scripts/test_vkprloop_drift_921.mjs` (PR #922 / #921) and `scripts/test_vkprloop_drift_915.mjs` (`origin/vk`). Removed conflict markers only. |

Staged from merge (unchanged this round): `scripts/fixtures/vkprloop-drift-915.txt`, `scripts/test_vkprloop_drift_915.mjs`. No `public/assets/*.js` conflict; rebake not run.

## Checks (lane)

| check | result |
| --- | --- |
| `node scripts/test_vkprloop_drift_921.mjs` | PASS |
| `node scripts/test_vkprloop_drift_915.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (438 offline, 18 online) |
| `node scripts/check-no-comments.mjs` | BLOCKED locally: missing `apps/vacation-client/node_modules/typescript` (run root + `apps/vacation-client` `npm ci` before host pre-DONE) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | not run (blocked on same deps) |
| `cd apps/vacation-client && npm test` | PARTIAL: budget + dayTimeline PASS; `detail.unit.mjs` ERR_MODULE_NOT_FOUND `@neondatabase/serverless` (no `npm ci` in worktree) |

## Host publish

1. `git add scripts/offline-tests.txt` (resolve UU), then `git commit --no-edit` to finish the in-progress merge; push once to `grok/tsv-921-formal-model-drift-vkprloop-tla-behind-d`.
2. After `npm ci` (repo root + vacation-client): `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`, full `scripts/offline-tests.txt` suite per lane brief, then CI on new head.

---

# PR #908 / #901 — host base-merge follow-up (9420e788)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `9420e788aaf9d712bbcc2ce6c96f9eb7c77c7381` (verified). **Lane:** cursor-ubuntu, composer-2.5.

Host merged `origin/vk` at `2608a0ecbf08f33cc735b9824a357982a96d914e` into `9420e788`. Conflicted file: `J/RECEIPT.md` only. This round resolved that conflict (both sides kept below), ran `node scripts/rebake_served_trek_bundle.mjs` (no asset delta vs index), and re-ran pre-DONE gates.

## Checks @ `9420e788` + conflict resolution

| check | result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1128 files; `apps/vacation-client/npm ci` first) |
| `node scripts/test_offline_manifest.mjs` | PASS (436 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Left alone (vk scope) — #896 inherited

- Gate B pixel/screenshot capture beyond regression tests above, Piccola hours garbage, duplicate Blue Note titles, Zinc 404 logo hunt.

No CI run id on this uncommitted tree; pending host commit of staged merge + this `J/RECEIPT.md` resolution.

## Host publish (vk #901 / #908 — historical)

1. `git add J/RECEIPT.md` (conflict resolved); commit the staged host-merge index (80 paths) with merge message; push once to `vkfill/901-20261109163211`.
2. CI `unit-tests`, then Gate B structure on the new head.
3. Trip 99 live: apply `J/trip99-change.sql` + `J/trip99-change.json` per sections below before expecting live `/api/shared` to match fixtures.

**Uncommitted / staged (host):** merge index ~80 files from `origin/vk` (rebrand, #905 chat-itinerary pieces, `vacation-app.html` composer catch, etc.) plus this `J/RECEIPT.md`.

Baselines, Gate B config thresholds, `package.json`, deploy config, workflows. Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).

---

# #901 / PR #908: unit-tests fix (prior round summary, still authoritative)

**Prior start HEAD:** `3e710445c8aba3bc661ac65cafb9f4b1fed9470c`.

## Failure reproduced (9913e460 / 3e710445)

`node scripts/test_gate_b_live_replay_display_facts.mjs` gave `served: place 664 price must match hosted` (`65 !== 25`), and `externalId` wrong for 664 and 669.

## Root cause

PR rewrote 664/669/672 in Gate B served fixture while hosted live replay still held old bundle rows; ccab `Big Apple Greeter.price` 0 → null triggered estimator 65.

## Data changes (on branch; in staged merge)

| file | change |
| --- | --- |
| `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` | Trip 99 post-image for 664/669/672 |
| `scripts/fixtures/gate-b-nyc-shared-staging.json` | 664 place + override `price` 0 → 65 |
| `scripts/fixtures/pr336-vk-search-places.snapshot.json` | 664 `price` 0 → 65 |
| `J/trip99-change.sql`, etc. | Host Neon apply path |

---

# PR #913 / vkfill-905 port — inherited from `origin/vk` merge

`vacation-app.html` composer status needle for `scripts/test_reply_action_claim_d2_paia_save_route.mjs`; chat-itinerary edits on staged index.
