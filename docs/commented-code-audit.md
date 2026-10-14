# TSV [#397](https://github.com/grampadsbot-sudo/timesyncher/issues/397) — Comment-bearing code integrity audit

## Immutable inputs

| Input | SHA / identity |
| --- | --- |
| [PR401](https://github.com/grampadsbot-sudo/timesyncher/pull/401) reviewed head | `1d302b1de146dd9ff822f8df0ac24780033e0478` |
| Canonical pre-deletion source | `b6980aa6e3c710a00c5d979064dff671855b4e29` |
| [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) candidate, read only | `e9b1b447c3dc4a6a154725f76a78a3ba052c891a` |
| Canonical inventory | [`comment-audit-evidence.json`](comment-audit-evidence.json) |

Nothing in this report approves a later head, [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336), the deployed harness, or overall integrity.

## Exact coverage

- Canonical comments: **405**.
- Canonical unique paths: **192**.
- Ledger entries / unique paths: **192 / 192**.
- Statuses: **144 clean, 21 known, 26 new findings, 1 file-specific gap**.
- Missing / extra / duplicate paths: **0 / 0 / 0**.
- Inventory and ledger path SHA-256: `a0c16a27a0210a39b503a0265b616e6b7e5fac078ea2acff3bc39ddee4172789`.
- Exact coverage: **true**.

The machine-readable [`comment-audit-ledger.json`](comment-audit-ledger.json) records, for every path, `path`, `sourceSHA`, source blob SHA, concrete functions or data constants, inputs/transformations/outputs/callers, introducing history for every preserved comment site, source/caller/history evidence, finding, disposition, and review attestation. [`tsv397-audit-decisions.tsv`](tsv397-audit-decisions.tsv) is the compact decision index.

Every module was read in full at the canonical source. Relevant producers, consumers, acceptance return paths, current-head behavior, [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) candidate paths, blame commits, and introducing diffs were reviewed. Comments were treated as leads, not proof.

## [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) acceptance blockers outside the 192-file denominator

| ID | Evidence-backed blocker | Required follow-through |
| --- | --- | --- |
| P336-A | shared-trip-handler serves a purpose-built NYC positive fixture for one production slug before the configured upstream. Evidence: `e9b1b447:src/vacation/shared-trip-handler.mjs:138-142,196-216`, `e9b1b447:scripts/fixtures/gate-b-approved-shared-trip.mjs:1-7`, `e9b1b447:scripts/fixtures/nyc-craig-kim-daybyday-positive-v1.mjs`, `e9b1b447:scripts/lib/gate-b-nyc-fixture-contract.mjs`. | Remove fixture-specific production serving. Exercise the candidate through the normal sourced payload boundary, reject synthetic summaries/prices/timing, and retain [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402)/[#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) ownership without treating their fixes as approval here. |
| P336-B | run-shared-served-vacation-client-tests returns success when puppeteer-core is unavailable, so browser assertions can be skipped. Evidence: `e9b1b447:scripts/lib/run-shared-served-vacation-client-tests.mjs:17-26,108-114`, `e9b1b447:package.json`, `e9b1b447:.github/workflows/evidence-secrets.yml:57-60`. | Make missing browser support fail the acceptance command and prove the browser suite actually executes in its owning CI job. |

P336-A violates the boundary recorded in closed TSV [#343](https://github.com/grampadsbot-sudo/timesyncher/issues/343): local positive-fixture evidence was expressly not a Gate B verdict and fixture-specific production behavior, fake data, generic templates, and fabricated prices were banned. The candidate serves that purpose-built payload before configured upstream data and can make its narrow contract return `pass: true` for synthetic values.

Known candidate ownership remains unchanged: TSV [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402) owns summary padding; TSV [#403](https://github.com/grampadsbot-sudo/timesyncher/issues/403) owns the split budget key; TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) owns LAYOUT-NYC verdict suppression. Those issues do not approve P336-A or P336-B.

## New report-only findings

No product, gate, fixture, baseline, threshold, workflow, dependency, environment, deploy, or generated asset fix is made here. Each action below is a scoped follow-through brief.

| Path | Finding | Follow-through |
| --- | --- | --- |
| `.cursor/skills/verify-timesyncher-vacation/scripts/onboarding-welcome-precheck.mjs` | Trip-site HTTP failures other than 404 can still produce onboarding PASS. | Require a successful final HTTP status, add 3xx/403/429/5xx cases, and prove no packet can pass with them. |
| `apps/vacation-client/src/lib/dayTimelineModel.mjs` | [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) can render an unassigned flight on every itinerary day. | Require a flight assignment or explicit matching dayIds before adding an unassigned flight. Add a negative test for a timeline flight with no assignment and no dayIds. Route all displayed day headings through one helper so titled days still include the required day number. |
| `apps/vacation-client/test/run-all.mjs` | The normal CI test command silently skips every browser layout acceptance suite. | Make the CI quality-gate job provide a browser switch and execute shell-layout, or fail when layout acceptance is unavailable. Do not treat the current skip as a successful full test run. |
| `scripts/baseline-subset.mjs` | New-rule seed rows need not match current findings, pre-authorizing arbitrary future suppressions. | Require every new-rule seed row to correspond to a current finding and fail or prune unmatched stale entries. Add a regression where an unused future path or symbol under a new rule cannot pre-authorize a later suppression. |
| `scripts/check-code-ratchet.mjs` | The code ratchet names the vacation-client source root but silently rejects every nested app path. | Make inScope recognize every configured root and add an app source violation that must appear in the ratchet report. Keep baseline seed-row authorization under the baseline-subset follow-through. |
| `scripts/lib/itinerary-fresh-gate-metrics.mjs` | The logo comparator can pass candidates that violate both declared centering thresholds. | Require every candidate to meet an explicit absolute or bounded-reference contract, fail unmatched expected rows, and include the Stores logoCenter pass in the aggregate gate. |
| `scripts/lib/logo-chip-center-of-mass.mjs` | The logo centering gate measures a newly centered redraw, not the browser's rendered logo position. | Replace the synthetic redraw metric with pixels captured from the actual rendered wrapper, or compute the real img rect and intrinsic ink offset in wrapper coordinates. Add a negative regression that deliberately offsets the img and must fail while the centered case passes. Keep screenshots as evidence, not an unexamined side artifact. |
| `scripts/lib/logo-pixel-ink-grade.mjs` | The LOGO ink gate measures styled chip chrome instead of isolating logo pixels. | Measure only image or fallback glyph pixels, or mask chip border/background. Add a production-styled blank or transparent image regression that requires row and Cars logo gates to fail. |
| `scripts/live_v7_dialog_pdf.py` | Invalid timing evidence is rewritten into valid-looking evidence. | Reject zev= and any timing line missing an original jev= token before rendering. Remove the replacement. Change the poisoned-input regression to require nonzero exit and no PDF output. |
| `scripts/screenshot-journey-pdf.mjs` | Direct coverage markers can convert a missing or rejected screenshot into captured coverage. | Make screenshot acceptance page-derived. Remove direct mark calls or record non-screen checks separately. Add captured coverage only after shot returns true and its page exists. Before writing VERIFY or the PDF, assert every captured feature has a corresponding page or an explicit exempt gap. Add a regression test for rejected and missing screenshots. |
| `scripts/shepherd-staging-smoke-helpers.mjs` | Missing server timing disables the check-5 10-second threshold. | Make missing required trip-create timing a harness failure and add an absent-timing regression. |
| `scripts/shepherd-staging-smoke-layout-visual-run.mjs` | The proof runner can grade a deployment identified only by a seven-character SHA prefix. | Require exactly 40 hex characters and exact endpoint equality. Omit or mark unobserved deployment ID. Add negative tests for short input, same-prefix mismatch, and missing deployment ID. |
| `scripts/shepherd-staging-smoke-run-check.mjs` | INFRA_BLOCKED GO checks can produce a passing GO gate and exit 0. | Require PASS for every GO entry. Missing, INFRA_BLOCKED, timed-out, or any non-PASS status must fail GO and exit nonzero while retaining diagnostics. Add blocked LAYOUT/VISUAL runner regressions. |
| `scripts/shepherd-staging-smoke-single-instance.mjs` | The smoke single-instance lock is not atomically acquired. | Create the lock with an exclusive atomic operation such as openSync using wx. Replace stale locks with a race-safe retry. Add a multi-process test that starts contenders together and proves exactly one acquires the lock. |
| `scripts/shepherd-staging-smoke-visual-seed.mjs` | VISUAL ignores failed shared-tab seed posts and excludes their screenshots from its verdict. | Propagate the seed result into minting and fail VISUAL on any non-201 seed response. Add explicit shared-tab row assertions or include shared screenshots and hydration failures in the final pass predicate. Add a negative test with a failed seed post. |
| `scripts/test_inv_claim_first_intake_prompt_premise.mjs` | The test does not enforce its stated zero-Things and no-lodging premise. | Assert an empty things array and the exact absent or null lodging shape as separate literal expectations before evaluating the prompt wording. |
| `scripts/test_inv_claim_lodging_relevance_route.mjs` | The INV-CLAIM test bypasses the route decision it claims to prove. | Drive the queue or POST route and assert actual flags, provider calls, HTTP result, and persisted payload. |
| `scripts/test_trip_create_nominatim_critical_path.mjs` | The critical-path Nominatim assertion is a hard-coded zero unrelated to HTTP. | Exercise the real boundary with an instrumented scheduler and prove the response completes before deferred geocoding. |
| `scripts/vacation-app-reply-rules.mjs` | The production xAI model id is character-code encoded to evade the hard-coded-content gate. | Replace the character-code encoding with an explicit reviewed constant or allowlist entry. Remove encoded model reconstruction from recorded fixtures. Extend the evasion scanner and tests to detect String.fromCharCode construction of banned model identifiers. |
| `src/vacation/customer-intent.mjs` | Missing customer-intent keys suppress the safe ask fallback. | Validate complete response shape, throw on missing/invalid keys, and prove incomplete JSON falls back with ask true. |
| `src/vacation/in-turn-place-reply-fallback.mjs` | A failed model reply is synthesized into an ok true Gate B reply. | Separate user-facing resilience from Gate B evidence. Preserve a fallback response for product availability if desired, but mark fallback use as degraded and make the acceptance gate require a valid model-authored grounded reply. Add tests that fallback responses cannot satisfy Gate B 6/6b. |
| `src/vacation/keepsake-list-minimums.mjs` | Zero or negative env threshold disables Jev filtering. | Reject unauthorized/out-of-range thresholds; test 0, negative, NaN, and extremes; prove low scores cannot pass any accepted production configuration. |
| `src/vacation/provider-env.mjs` | Provider secret names are deliberately split and suffix-matched, while the deploy scanner contains a bespoke decoder for that exact split. | Replace suffix discovery and joined key-name fragments with an explicit boundary mapping that the repository's policy permits and scans normally. Remove the scanner's syntax-specific decoder. Add negative coverage for similarly suffixed decoy variables and prove only the intended provider keys are read. Coordinate any policy exception explicitly rather than encoding around the rule. |
| `src/vacation/search-place-output.mjs` | The VK contract accepts an empty batch and 15 unsupported-category rows. | Fail empty lists, reject unsupported categories before counting, and add literal expected-failure tests. |
| `src/vacation/thing-logo-capture.mjs` | A bare matching brand name can manufacture a favicon and hide a future logo-source gap. | Require persisted logo, favicon, website, or source-record evidence before deriving a brand favicon. Keep the current sourced Priceline row, add a negative bare-name case, and render the category glyph with logoCaptureReason when no sourced logo exists. |
| `src/vacation/web-access.mjs` | assert_can_edit trusts two matching client-controlled values. | Remove raw equality or authenticate it at a trusted boundary; derive owner from the trip; add HTTP negative proof that forged matching body/header values receive 403. |

## Known ownership and preserved fixes

| Path | Owner | Assessment |
| --- | --- | --- |
| `apps/vacation-client/src/lib/budgetModel.mjs` | TSV [#322](https://github.com/grampadsbot-sudo/timesyncher/issues/322) (closed; unresolved at audited source) | Closed TSV [#322](https://github.com/grampadsbot-sudo/timesyncher/issues/322) explicitly owns the still-self-referential Budget completeness checks. |
| `apps/vacation-client/src/lib/listTabModel.mjs` | [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402) | [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) summary padding is already owned by [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402). |
| `apps/vacation-client/test/fixtures/enriched-detail-shared-trip.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The declarative detail fixture does not itself create a false pass; NYC layout ownership remains with TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408). |
| `routes/vacation-itinerary.mjs` | TSV [#397](https://github.com/grampadsbot-sudo/timesyncher/issues/397), fixed by af7f6e724f77b909002a6cd14e94f50f7c31ba38 | The source mega-comment made route-wiring regex assertions pass without proving the symbols were executable in this module. |
| `scripts/capture_itinerary_fresh_daybyday_gate.mjs` | [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The hard-coded NYC capture path is reserved to [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408). |
| `scripts/fixtures/gate-b-approved-shared-trip.mjs` | [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402) and [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) changes acceptance to the synthetic positive NYC fixture. |
| `scripts/fixtures/pr336-vk-search-trip-sources.mjs` | TSV [#355](https://github.com/grampadsbot-sudo/timesyncher/issues/355) (closed; unresolved row 608 contract failure) | Closed TSV [#355](https://github.com/grampadsbot-sudo/timesyncher/issues/355) explicitly preserves row 608 as failing while acceptance filters it out. |
| `scripts/fixtures/seed_nyc_trip_ccab.py` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The LAYOUT-NYC path depends on a hard-coded local NYC screenshot seed. |
| `scripts/lib/gate-b-nyc-fixture-contract.mjs` | [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402) | The 30-word threshold can accept [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336)'s generic summary padding. |
| `scripts/lib/pr336-gate-b-xai-recorded-lib.mjs` | TSV [#397](https://github.com/grampadsbot-sudo/timesyncher/issues/397) / 4bb5e57c | Source reversibly encodes the banned model ID. |
| `scripts/shepherd-staging-smoke-layout-nyc-header.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The shared-header probe is part of the owned LAYOUT-NYC acceptance path. |
| `scripts/shepherd-staging-smoke-layout-nyc.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | LAYOUT-NYC suppresses judge failures and can end as non-failing INFRA_BLOCKED. |
| `scripts/shepherd-staging-smoke-layout-spine.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The layout spine maps LAYOUT-NYC infrastructure failure to a non-failing smoke status. |
| `scripts/shepherd-staging-smoke-thing-card-dom.mjs` | [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The accurate DOM evidence feeds the known LAYOUT-NYC verdict suppression. |
| `scripts/shepherd-staging-smoke-thing-card-eval.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The default-off sort prohibition is not the active LAYOUT-NYC acceptance mechanism. |
| `scripts/test_pr225_served_tabs_overflow.mjs` | [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The fixed NYC layout path is within [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) ownership; no separate defect is added. |
| `scripts/test_vk_search_place_output_contract.mjs` | TSV [#355](https://github.com/grampadsbot-sudo/timesyncher/issues/355) (closed; unresolved at audited source) | Closed TSV [#355](https://github.com/grampadsbot-sudo/timesyncher/issues/355) owns the unresolved substitution of synthetic rows for the real trip-level contract. |
| `scripts/verify_pr225_nyc_sbs_layout.mjs` | [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | The side-by-side verifier checks artifact structure and size, not image content. |
| `src/vacation/search-progress.mjs` | [#403](https://github.com/grampadsbot-sudo/timesyncher/issues/403) | The split budget-key literal is already owned by [#403](https://github.com/grampadsbot-sudo/timesyncher/issues/403). |
| `src/vacation/shared-trip-live-app-fields.mjs` | [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402) | Base copies source fields; [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) adds known padding risk. |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408) | Patch markers feed the existing LAYOUT-NYC acceptance path owned by TSV [#408](https://github.com/grampadsbot-sudo/timesyncher/issues/408). |

Earlier [PR401](https://github.com/grampadsbot-sudo/timesyncher/pull/401) corrections remain preserved: invented NYC event fallback removal, detail-judge title-prefix removal, executable route-wiring assertions, recorded model-ID stripping, and token-inclusive no-comment enforcement. This audit does not convert those scoped fixes into overall integrity approval.

## Explicit unresolved gaps

| Gap | Missing evidence | Consequence |
| --- | --- | --- |
| GAP-DEPLOYED-HEADER — `scripts/test_keepsake_order_buy_link.mjs` | No allowed deployed response was available to prove final X-Frame-Options precedence; the local helper encodes the desired result. | No platform-precedence approval. |
| GAP-DEPLOYED-HARNESS — `~/tsv-gateb and ~/tsv-dispatch` | Both external runtime trees are absent on this VM. | No deployed harness source, SHA, or drift approval. |
| GAP-VK-CONTRACT — `skills/vk-thing-data-contract/skill` | The canonical skill and its one field list and banned-value list were not available in the repository, history, deleted-page lookup, or accessible GBrain skill/page catalog. | Issue [#349](https://github.com/grampadsbot-sudo/timesyncher/issues/349)/[#355](https://github.com/grampadsbot-sudo/timesyncher/issues/355) comments provide partial context only; no claim of full canonical VK contract conformance. |
| GAP-PSTACK-HOST — `external pstack /no-comments and /deslop` | The installed /no-comments skill does not invoke the repository checks, and /deslop is unavailable. | No external pstack-lint integration approval. |

The canonical `skills/vk-thing-data-contract/skill` field and banned-value lists were not accessible. Issue comments provide partial context only. Accordingly, DATA-CONTRACT failures above remain harness/data faults and were not patched around in UI or fixture text.

## Verification

Passed locally on the report-only tree:

- `python3 /tmp/tsv397-audit/validate-results.py` — 405 comments, 192/192 unique paths, identical path digests, zero missing/extra/duplicate paths, zero validation errors.
- `node scripts/test_tsv397_integrity_audit.mjs`.
- `node scripts/test_check_no_comments.mjs && node scripts/check-no-comments.mjs`.
- JSON parse, required-field, source/blob SHA, and preserved-comment blame-commit validation for every ledger entry.
- Exact inventory/ledger path-set and digest comparison.
- Changed-path scope check: only this report and its two evidence artifacts.

No CI rerun, screenshot capture, baseline comparison, deployment, Vercel command, merge, rebase, cherry-pick, fixture mutation, or [PR336](https://github.com/grampadsbot-sudo/timesyncher/pull/336) edit was performed.

## Conclusion

The original 405-comment / 192-file inventory now has exact, substantive per-file coverage. Integrity approval remains withheld because 26 new findings, 21 known ownership records, the file-specific deployed header gap, two candidate acceptance blockers, and the external deployed-harness, VK-contract, and pstack gaps remain unresolved. Keep `hold:integrity-review`; do not treat exact coverage as a clean verdict.
