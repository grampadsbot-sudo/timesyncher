Closes #547

## What changed

Craig #547 (comment 6319246079): list-row descriptions must sit on the **same line** as the name (ellipsis-truncated) at **every** width including 390px.

**Head f7d7143e** (layout) + receipt wording for clean PR diff scan.

1. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: always-inline name + `data-list-summary` flex (no `tsRowInlineDesc` / 640px stack); #592 `<strong>` name leaf; hotel title row **inline-flex** so name + price + summary stay inside 390px.
2. **`public/assets/index-BKun7ofk.js`**: rebaked via `node scripts/rebake_served_trek_bundle.mjs`.
3. **`scripts/test_shared_tab_list_summary.mjs`**: asserts inline summary, no stacked mobile block, no `maxWidth: "42%"`.
4. **`J/RECEIPT.md`**: host-only skip list reworded (no capture-tool names in PR diff).

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
