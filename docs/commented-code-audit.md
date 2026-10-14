# TSV #397 — Comment-bearing code integrity audit

## Immutable inputs

| Label | SHA | Note |
| --- | --- | --- |
| PR401 GPT-round start | `ed302dc1eecf4450b956e950218ca6da039cf5e0` | Existing PR401 branch after the CI-only repair |
| Migration audit base | `b6980aa6e3c710a00c5d979064dff671855b4e29` | Required original comment/source evidence |
| PR336 candidate | `e9b1b447c3dc4a6a154725f76a78a3ba052c891a` | Read-only candidate evidence |

If either audit input moves, re-review the complete PR336 diff, served-source/capture wiring, fixture/API provenance, acceptance return paths, and the comment inventory delta. Nothing in this report approves a later head.

## Inventory and evidence integrity

- [`comment-audit-evidence.json`](comment-audit-evidence.json) is the canonical pre-deletion inventory: **405 comments in 192 unique scoped first-party files** at the migration audit base. It includes the three paths omitted by the earlier text list: `scripts/export_trek_sqlite_to_hosted.py`, `scripts/fixtures/seed_nyc_trip_ccab.py`, and `scripts/run-once.sh`.
- The saved previews match the original source. The sole sanitizer transformation is `api[.]foursquare[.]com` host defanging.
- [`commented-code-audit-inventory.txt`](commented-code-audit-inventory.txt) is retained only as a supplemental broad review corpus. It contains generated, HTML, JSON, and package paths and is not the scoped coverage denominator.
- Generated `public/assets/**` output was not edited. Existing bundle/source checks cover its first-party needles; vendored license text remains intact.
- Current enforcement scans the requested source roots and root code/config files. Only shebangs, behavior-changing machine directives, `scripts/fixtures/code-ratchet/**`, dependencies, and generated output are exempt.

## Coverage status

All 405 preserved comment sites and adjacent source were reviewed. The critical PR336 and acceptance flows and 52 migration-base files were read in full. The other **140 comment-bearing files have comment-context review but not the required full module/data-flow/history review**. Therefore this is not an exhaustive clean audit and PR401 must remain on `hold:integrity-review`.

The read-only runtime paths `~/tsv-gateb` and `~/tsv-dispatch` are absent on this VM, so deployed/source SHAs and drift could not be checked. That is an additional coverage gap.

## PR336 candidate findings

| ID | Location | Original criterion | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P336-1 | `apps/vacation-client/src/lib/listTabModel.mjs` — `SUMMARY_QUALITY_PAD`, `ensureMinSummaryWords()` | ≥30-word sourced list-row copy | Fixed generic text is appended until the count passes. | **Open:** [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402). |
| P336-2 | Same file — `rowSummary()` | Event source fields | Synthesized labels still flow through the fixed-word pad. | **Open:** [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402). |
| P336-3 | `src/vacation/shared-trip-live-app-fields.mjs` — 30-word branch | VK long-description contract | Template enrichment can turn a source gap into a passing long description. | **Open:** [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402). |
| P336-4 | Candidate `trip-thing-enrichment.mjs` event fallback | VK no-invented-data rule | Invented NYC room/crowd narrative remains on the immutable candidate. | **Open on candidate:** base fix F-1 cannot approve or mutate PR336. |

P336-1 through P336-3 stay unresolved exactly as Craig directed. Candidate fixture facts, deployment config, baselines, capture config, and generated bundles were not changed. The candidate does not contain several later migration-base harness files, so migration-base review cannot be silently treated as candidate proof.

## Migration-base findings

| ID | Original source / introducing commit | Criterion | Assessment | Disposition |
| --- | --- | --- | --- | --- |
| F-1 | `src/vacation/trip-thing-enrichment.mjs` — event fallback | VK sourced-data contract | Invented NYC venue narrative. | **Fixed earlier in PR401:** fallback no longer invents NYC facts; focused positive/negative regression retained. |
| F-2 | `src/vacation/place-detail-extract.mjs` — `buildSummaryFromResults()` | Detail judge | Prefixing the title injected judge tokens. | **Fixed earlier in PR401:** prefix removed; regression retained. |
| F-3 | `routes/vacation-itinerary.mjs` mega-comment | Route wiring grep | Comment text, not executable wiring, satisfied the test. | **Fixed earlier in PR401:** test checks executable module wiring. |
| F-4 | `scripts/lib/pr336-gate-b-xai-recorded-lib.mjs`, `0def5822` | `MODEL-BARE` hard-coded-content rule | The forbidden model ID was deleted and then reversibly encoded as character codes solely to pass the rule. | **Fixed:** recording sanitizer now removes both forms while preserving ordinary payload fields; regression covers positive and negative paths. |
| F-5 | `scripts/lib/comment-tools.mjs` | No-comment acceptance | AST-only traversal missed comments in empty blocks and inline type casts; checker falsely passed. | **Fixed:** token-inclusive AST traversal, root-file coverage, no self-exemption, 14 residual comments removed, and real executable rejection/acceptance proof added. |
| U-1 | `apps/vacation-client/src/lib/budgetModel.mjs:14`, `58719dc8`; same split in server/search modules | `BAR-THING-CUSTOMER` | `'Other ' + 'Thi' + 'ngs'` was explicitly introduced to evade the prose scan. The runtime key spans client/server and persisted budget targets. | **Unresolved/nontrivial:** needs a narrowly owned contract migration; no owning issue exists. Do not call comment deletion a fix. |
| U-2 | `scripts/shepherd-staging-smoke-layout-nyc.mjs` — `reconcileLayoutNycJudgeVerdict()`, `44ed9f45`/`9cf49b97` | LAYOUT-NYC vision + DOM acceptance | A bundled `header/row layout mismatch` vision failure could be suppressed when partial DOM checks passed. | **Fixed on merged base by `18945921`:** bundled header/row failures remain fail-closed; focused negative tests cover genuine row-layout defects while isolated stale sort claims remain permitted. |
| L-1 | `scripts/shepherd-staging-smoke-thing-card-eval.mjs`, `41b5a4fa` | Current Name/Price controls | Default-off legacy “forbid sort pills” check does not make the current LAYOUT-NYC check pass; current LAYOUT-NYC requires Name/Price buttons and fails when absent. | **Reviewed/no current bypass; no change.** |
| L-2 | `src/vacation/thing-logo-capture.mjs`, `5db91bf4`/`7f138e8c` | VK real-logo contract | Exact known brands map to their official first-party favicon URLs; generic/shared placeholders remain rejected. | **Legitimate sourced brand constants; no change.** |
| L-3 | `src/vacation/shared-trip-handler.mjs` approved slug and harness headless use | Offline fixture/capture wiring | Fixture selection and capture execution, not product render branching. | **Legitimate harness behavior; no change.** |

U-1 still lacks the separately linked owning issue/PR required by Craig. GitHub access in this round is read-only for issue creation. The managing doctor must route that contract-migration brief.

## No-comment acceptance and pstack status

- Repository executable: `scripts/check-no-comments.mjs`; it now reports `file:line` and scans 747 current files.
- Regression: `scripts/test_check_no_comments.mjs` writes a temporary real scoped source comment, proves the executable fails at its exact line, removes it, then proves the clean repository passes. It also covers comments in empty blocks and inline type casts.
- CI path remains the existing `evidence-secrets` job’s “Code ratchet” step; no workflow was loosened or edited in this round.
- Applicable pstack rule is external to this repository at `/home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/837067b75aa20ab58d7b2a2f6c0531e37118c596/skills/no-comments/SKILL.md`. It belongs to pstack plugin v0.15.23 (owner Lauren Tan, `cursor/plugins`). No `pstack` executable or repository pstack-lint command exists. That external lint does not invoke the repository verifier, and this branch cannot commit a host-plugin change.
- Required host follow-through: the `cursor/plugins` pstack owner must make `/no-comments` acceptance invoke both `node scripts/test_check_no_comments.mjs` and `node scripts/check-no-comments.mjs` at the target repository root. Until that exact path is updated and independently proven, Craig’s pstack-lint requirement is **not done**.

## Verification

Passed locally:

- `npm run typecheck && npm run lint && npm run test` in `apps/vacation-client`
- `node scripts/test_check_no_comments.mjs && node scripts/check-no-comments.mjs`
- `node scripts/test_tsv397_integrity_audit.mjs`
- `node scripts/test_check_hardcoded_content.mjs && node scripts/check-hardcoded-content.mjs`
- `node scripts/test_check_code_ratchet.mjs && node scripts/check-code-ratchet.mjs`
- `node scripts/test_evidence_secrets.mjs && node scripts/check-evidence-secrets.mjs`
- `node scripts/scan-built-bundles.mjs`
- affected chat, logo, and Gate B product-row regressions

Focused proof covers:

- sourced event detail remains intact and unsourced NYC fiction cannot pass;
- title-prefix judge gaming cannot pass;
- reversible model-ID encoding cannot survive the recording sanitizer;
- a real scoped comment fails and a comment-free tree passes;
- existing focused unit, hard-coded-content, ratchet, secrets, and client type/lint/test suites.

Following the chief-doctor CI override, `scripts/test_check_no_comments.mjs` and `scripts/test_tsv397_integrity_audit.mjs` are registered as genuine offline tests. `node scripts/run-offline-tests.mjs` passes all 264 offline entries, including the strengthened executable-module wiring assertions exposed when the old mega-comment was removed.

## Blocking conclusion

PR401 must remain held. The remaining audit blockers are: 140 files short of full file/data-flow/history audit, unavailable deployed harness provenance, U-1 without linked owning work, unresolved [#402](https://github.com/grampadsbot-sudo/timesyncher/issues/402), and external pstack lint not yet wired to the verifier. The chief-doctor override makes exact-head CI green the acceptance criterion for this CI-only round; it does not lift `hold:integrity-review`.
