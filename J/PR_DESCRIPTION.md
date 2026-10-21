Closes #547

## What changed

Craig #547 (comment 6319246079): list-row descriptions must sit on the **same line** as the name (ellipsis-truncated) at **every** width including 390px. `ec8ed390` used `tsRowInlineDesc` / `matchMedia('(max-width:640px)')` to stack the summary below the name on narrow viewports.

1. **Merge** `origin/migrate/trek-source` (host-started): resolved `public/assets/index-BKun7ofk.js` by taking the base bundle, then rebaked.
2. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: always inline name + `data-list-summary` in one flex row; strip `tsRowInlineDesc` and remove stacked mobile summary blocks.
3. **`scripts/test_shared_tab_list_summary.mjs`**: assert no viewport gate; inline summary at all widths.
4. **`public/assets/index-BKun7ofk.js`**: `node scripts/rebake_served_trek_bundle.mjs`.

## Verification (local)

| Command | Result |
|---|---|
| `node scripts/rebake_served_trek_bundle.mjs` | OK — sha256 `7537016304958d3d225948d51b6b83189a6afa56b4b78d3cb5bb5318957e7853` |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

Full `node scripts/run-offline-tests.mjs` on this lane host stops at `scripts/test_live_transcript_dialog_pdf.mjs` (`pdftotext` not installed; CI installs `poppler-utils`). Layout tests for this PR are green above.

## Scope / left alone

- Description **substance** (#549), prices, timeline/icons, baselines, Gate B config, fixtures.
- Keepsake HTML list rows unchanged.
