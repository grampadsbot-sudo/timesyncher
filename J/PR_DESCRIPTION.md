Closes #547

## What changed

Craig #547 (comment 6319246079): list-row descriptions must sit on the **same line** as the name (ellipsis-truncated) at **every** width including 390px.

**Base-merge** `origin/migrate/trek-source` at **446e1913** (#592): keep Gate B `<strong>` name leaf for default titles and #550 same-line `data-list-summary` flex (no `tsRowInlineDesc` / 640px stack).

1. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: merged #592 strong wrappers with always-inline name + summary row; strip viewport gate and stacked mobile summary blocks.
2. **`public/assets/index-BKun7ofk.js`**: took base bundle, `node scripts/rebake_served_trek_bundle.mjs`.
3. **`scripts/test_itinerary_fresh_daybyday_bundle.mjs`**: base (#592 strong assert) unchanged.

## Verification (local)

| Command | Result |
|---|---|
| `node scripts/rebake_served_trek_bundle.mjs` | OK — sha256 `53a6dc031383304041d59676ea0c69e2f813fa176b0e856e5c9258ff656b6eaf` |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

Full offline manifest on this lane host may stop at `scripts/test_live_transcript_dialog_pdf.mjs` when `pdftotext` is missing; CI installs `poppler-utils`.

## Scope / left alone

- Description **substance** (#549), prices, timeline/icons, baselines, Gate B config, fixtures.
- Keepsake HTML list rows unchanged.
