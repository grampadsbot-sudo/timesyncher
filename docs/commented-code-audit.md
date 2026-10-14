# TSV #397 — Comment-bearing code integrity audit

## Evidence SHAs (immutable audit inputs)

| Label | SHA | Branch / note |
| --- | --- | --- |
| Migration base (start) | `b6980aa6e3c710a00c5d979064dff671855b4e29` | `migrate/trek-source` at brief time |
| PR336 candidate | `e9b1b447c3dc4a6a154725f76a78a3ba052c891a` | `cursor/tsv-335-tsv-p3a-wiring-restart-serve-repaired-client-from-current-migration-base-b850` |

If either SHA moves, re-run: (1) full PR336 diff review, (2) Gate B / served-client wiring diff, (3) fixture ↔ API binding checks on the candidate head, (4) this inventory diff against the new base.

## Runtime harness (read-only)

| Path | Status |
| --- | --- |
| `~/tsv-gateb` | **Unavailable** on audit VM (path missing). Deployed/source SHA comparison not performed here. |
| `~/tsv-dispatch` | **Unavailable** on audit VM (path missing). |

## Comment-bearing first-party inventory

- **Start SHA inventory:** 210 paths (see [`docs/commented-code-audit-inventory.txt`](commented-code-audit-inventory.txt)).
- **Pre-removal evidence:** every comment text captured at strip time in [`docs/comment-audit-evidence.json`](comment-audit-evidence.json) (file, line, sanitized preview) before deletion in this PR.
- **Removal scope:** all comments stripped from `src/`, `apps/`, `scripts/`, `routes/`, `api/`, `.cursor/` for `.ts/.tsx/.js/.jsx/.mjs/.cjs/.css/.py/.sh`, with machine-directive and `scripts/fixtures/code-ratchet/**` allowlists only (see `scripts/check-no-comments.mjs`).
- **Excluded from edit-only (provenance verified):** `public/assets/*` minified bundles (upstream/served trek bundles scanned via existing `scripts/check-hardcoded-content.mjs` / bundle tests, not line-reviewed as hand-written source).
- **Coverage method:** Each inventoried path was read with its comments for hack vs legitimate disposition; critical-path modules and PR336 diff files were reviewed in full. Residual comment-free paths remain subject to the same hack patterns (e.g. PR336 padding code).

## PR336 candidate — false-pass and workaround findings (not merged in this PR)

Review target: `e9b1b447…` vs base `b6980aa6…`.

| ID | Location (candidate) | Criterion / check | Assessment | Disposition |
| --- | --- | --- | --- | --- |
| P336-1 | `apps/vacation-client/src/lib/listTabModel.mjs` — `SUMMARY_QUALITY_PAD`, `ensureMinSummaryWords()` | List row / Gate B copy quality (≥30 words, event field tokens) | **Confirmed bypass:** appends fixed generic pad in a loop until word count ≥30 regardless of source data. | **Unresolved on candidate** — remove pad; fail closed or use `buildCategoryDescription` only. |
| P336-2 | Same file — `rowSummary()` | Event rows must include `what it is:` / `when:` / `price:` patterns | **Risk:** synthesizes `When:` / `Price:` lines from schedule/price hints then still runs `ensureMinSummaryWords`. | **Unresolved on candidate** — tied to P336-1. |
| P336-3 | `src/vacation/shared-trip-live-app-fields.mjs` — `wordCount(enrichedDescription) >= 30` writes `longDetails`/`details` | Product row long copy / detail completeness | **Risk:** server-side padding of overrides to 30 words using enrichment templates (may mask missing VK fields). | **Unresolved on candidate** — should mirror VK contract failures, not template-fill. |
| P336-4 | `trip-thing-enrichment.mjs` (candidate) — `eventDescription` fallback string `classic NYC crowd` | DATA-CONTRACT / no invented venue narrative | **Invented geography/crowd copy** when performers missing. | **Partially addressed on base** in this PR (see F-1); candidate still needs matching removal. |
| P336-5 | `scripts/fixtures/nyc-craig-kim-daybyday-positive-v1.mjs`, `gate-b-approved-shared-trip.mjs` (candidate diff) | Gate B fixture | Not edited (out of scope for coder audit round). | **Documented only** — fixture truth is #339/#362 family, not re-litigated here. |
| P336-6 | `vercel.json`, `vite.config.mjs`, `capture/serve-dist.py` (candidate) | Serve wiring / capture | Not edited per audit scope. | **Documented only** — no approval inferred from CI green alone. |

**Legitimate on candidate (not workarounds):** `prepareServedTrip.mjs` re-export of `finalizeServedSharedTripPayload`; `opaqueCarPricelineLogoUrl` for Priceline opaque car SKUs; shared `buildCategoryDescription` import for real template enrichment (when not paired with P336-1 pad).

## Migration base — findings and fixes (this PR)

| ID | File / symbol | Introduced | Criterion | Why workaround vs legitimate | Disposition |
| --- | --- | --- | --- | --- | --- |
| F-1 | `src/vacation/trip-thing-enrichment.mjs` — `eventDescription` default `'Live set with a classic NYC room feel'` | Pre-base history | VK / product copy; Gate B detail richness | **Invented venue narrative** with no source field. | **Fixed** — generic booking guidance only; no NYC-specific fiction. |
| F-2 | `src/vacation/place-detail-extract.mjs` — `buildSummaryFromResults` title prefix when judge fails | Pre-base | `descriptionPassesDetailJudge` / detail summary | **Judge gaming:** prepend `title —` to inject title tokens. | **Fixed** — block removed. |
| F-3 | `routes/vacation-itinerary.mjs` — removed mega-comment listing queue wiring symbols | Pre-base | `test_chat_place_search.mjs` route grep | **False-pass:** test matched comment text, not executable imports. | **Fixed** — test asserts `vacation-app-chat-queue.mjs` + `vacation-from-chat-intake.mjs`; comment removed. |
| L-1 | `src/vacation/shared-trip-handler.mjs` — `GATE_B_APPROVED_SHARED_SLUG` | Fixture wiring | Gate B NYC capture trip | **Legitimate** slug → approved fixture builder for offline/Gate B; not a CI skip. | **No change** |
| L-2 | `src/vacation/trek-style2-bundle.mjs` — Gate B marker throws | Guard rails | Gate B layout contracts | **Legitimate** enforcement. | **No change** |
| L-3 | Harness scripts using Puppeteer headless | Test/capture harness | Gate B capture | **Legitimate** test harness (no detection-based render branching in product bundle). | **No change** |

## Test evidence (base after fixes)

Commands run on audit VM:

```bash
npm ci
cd apps/vacation-client && npm ci && cd ../..
node scripts/test_check_no_comments.mjs
node scripts/check-no-comments.mjs
node scripts/test_tsv397_integrity_audit.mjs
node scripts/test_trip_thing_logo_metadata.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/test_check_code_ratchet.mjs
node scripts/check-code-ratchet.mjs
node scripts/test_chat_place_search.mjs
```

Results: all **passed** on audit VM after combined comment removal + fixes.

### What tests prove

- **Negative:** Empty event source must not emit `classic NYC` / `Live set with` invented strings (`test_tsv397_integrity_audit.mjs`).
- **Positive:** Sourced event summary still includes schedule and source summary text.
- **Negative:** Search-derived summary must not use removed `title — summary` prefix pattern.
- **Regression:** Existing enrichment / logo / Gate B row field suite still passes.

## No-comment CI (issue #400 folded into #397)

- **Checker:** `scripts/check-no-comments.mjs` (TypeScript scanner for JS-like sources; fails with `file:line`).
- **Tests:** `scripts/test_check_no_comments.mjs`.
- **CI:** `evidence-secrets` job “Code ratchet” step (after `apps/vacation-client` npm ci).
- **Exemptions:** documented in checker — shebang, eslint/ts/vitest/c8/prettier/biome/noqa/shellcheck/webpack/sourceMappingURL directives; `scripts/fixtures/code-ratchet/**`; build output paths.

## Unresolved / out of scope (left alone)

- PR336 candidate items **P336-1 … P336-3** (require candidate-branch PR; hold PR336 approval).
- Baselines, `nyc-final-reference/`, thresholds, ratchet ceilings, `vercel.json`, `vite.config.mjs`, fixture fact edits.
- Host harness SHA diff (`~/tsv-gateb`, `~/tsv-dispatch`).

## Reviewed-file coverage summary

| Bucket | Paths | Depth |
| --- | ---: | --- |
| Full read (base + PR336 diff where changed) | 52 | Manual |
| Pattern scan only (remaining inventory) | 158 | Automated + spot checks |
| **Total inventoried** | **210** | |

No claim of “zero workarounds” on PR336 candidate until P336-1–P336-3 are fixed and re-reviewed on an updated candidate SHA.
