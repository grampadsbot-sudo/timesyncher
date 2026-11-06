# PR #826 / #825 — Cursor lane receipt (restore `data-ts-list-desc` capture leaf)

Result: **source-ready**, uncommitted patch for host publication. Starting HEAD: `15c60f5a37a63de8e189d04bb8881f7a00fb3299` (unchanged; no commit in lane). Branch: `vkfill/825-20261105070213`. Model: composer-2.5 (cursor-ubuntu). No OpenRouter or paid fallback.

## Change

CI on head `15c60f5a` failed unit-tests at `scripts/test_hotel_list_desc_capture_leaf.mjs:71` and `scripts/test_ui_734_round2_punchlist.mjs:21`: committed served bundle `public/assets/index-BKun7ofk.js` lacked `"data-ts-list-desc":"1"` while list rows still render descriptions via `data-list-summary`.

**Root cause:** `OE_ROW_SUMMARY_PATCH` in `src/vacation/shared-trip-oe-list-row-patch.mjs` emitted the stacked list description `<div>` without the Gate B / capture leaf attribute (regression vs base `be0d5486`).

**Fix:**

1. Add `"data-ts-list-desc":"1"` to `OE_ROW_SUMMARY_PATCH` and mobile SA/ALT summary patches.
2. Apply stacked/below-div summary needles in `patchSharedTripOeListRows` when present.
3. `ensureListDescCaptureLeaf()` at end of `patchSharedTripListWrapping` — idempotent `div`/`span` upgrade for any remaining `data-list-summary` nodes missing the leaf.
4. Rebake: `node scripts/rebake_served_trek_bundle.mjs` → served bundle sha256 `c1e3cc39baa93ec4f81ed33f6634c12d59e2f6f347a485d6c8678043260237b6`, `"data-ts-list-desc":"1"` count 2 (matches base contract).

**Files (uncommitted):**

- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js` (rebake === `renderServedTrekBundle`)

Prior fixes on this branch unchanged: `test_gate_b_product_row_fields.mjs:205` (`mr(G)`), `test_shared_tab_filter_chips.mjs` timeline budget assert.

## Local verification (starting HEAD `15c60f5a`)

| Command | Result |
| --- | --- |
| `node scripts/test_hotel_list_desc_capture_leaf.mjs` | exit 0 (bundle + puppeteer hotel rows) |
| `node scripts/test_ui_734_round2_punchlist.mjs` | exit 0 |
| `node scripts/test_shared_tab_filter_chips.mjs` | exit 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_list_row_description_substance.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 (after `apps/vacation-client` npm ci) |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `git diff --check` | exit 0 |

## Not done in lane (host)

- No commit, push, or PR head move — HOST PUBLICATION ONLY.
- GitHub CI / Gate B not run on a new head here.

## Scope left alone

Gate B pixel/overflow noise vs base, baselines, checkers, workflows, #827, deploy.
