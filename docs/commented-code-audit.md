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

- **Count:** 210 paths (see [`docs/commented-code-audit-inventory.txt`](commented-code-audit-inventory.txt)).
- **Excluded from edit-only (provenance verified):** `public/assets/*` minified bundles (upstream/served trek bundles scanned via existing `scripts/check-hardcoded-content.mjs` / bundle tests, not line-reviewed as hand-written source).
- **Coverage method:** Every inventoried path received at least automated pattern scan (`PAD-30`, `NYC-INVENT`, `JUDGE-BYPASS`, `GATE-FIXTURE`, `HEADLESS-DETECT`). Critical-path modules (shared trip serve/enrich, vacation-client list/detail models, VK contract scripts, Gate B row tests) were **read in full** on base SHA and PR336 candidate where they differ.

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
| L-1 | `src/vacation/shared-trip-handler.mjs` — `GATE_B_APPROVED_SHARED_SLUG` | Fixture wiring | Gate B NYC capture trip | **Legitimate** slug → approved fixture builder for offline/Gate B; not a CI skip. | **No change** |
| L-2 | `src/vacation/trek-style2-bundle.mjs` — Gate B marker throws | Guard rails | Gate B layout contracts | **Legitimate** enforcement. | **No change** |
| L-3 | Harness scripts using Puppeteer headless | Test/capture harness | Gate B capture | **Legitimate** test harness (no detection-based render branching in product bundle). | **No change** |

## Test evidence (base after fixes)

Commands run on audit VM:

```bash
npm ci
node scripts/test_tsv397_integrity_audit.mjs
node scripts/test_trip_thing_logo_metadata.mjs   # imports audit tests
node scripts/test_gate_b_product_row_fields.mjs
```

Results: all **passed** (stdout confirms).

### What tests prove

- **Negative:** Empty event source must not emit `classic NYC` / `Live set with` invented strings (`test_tsv397_integrity_audit.mjs`).
- **Positive:** Sourced event summary still includes schedule and source summary text.
- **Negative:** Search-derived summary must not use removed `title — summary` prefix pattern.
- **Regression:** Existing enrichment / logo / Gate B row field suite still passes.

## Unresolved / out of scope (left alone)

- PR336 candidate items **P336-1 … P336-3** (require candidate-branch PR; hold PR336 approval).
- Baselines, `nyc-final-reference/`, thresholds, `.github/` workflows, `scripts/offline-tests.txt`, `vercel.json`, `vite.config.mjs`.
- Comment deletion / no-comment CI (**#400**).
- Host harness SHA diff (`~/tsv-gateb`, `~/tsv-dispatch`).

## Reviewed-file coverage summary

| Bucket | Paths | Depth |
| --- | ---: | --- |
| Full read (base + PR336 diff where changed) | 52 | Manual |
| Pattern scan only (remaining inventory) | 158 | Automated + spot checks |
| **Total inventoried** | **210** | |

No claim of “zero workarounds” on PR336 candidate until P336-1–P336-3 are fixed and re-reviewed on an updated candidate SHA.
