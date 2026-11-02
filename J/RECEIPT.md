# vkfill-550 receipt — flight QoRest flex / row fill (HOST PUBLICATION ONLY)

## Outcome

**source-ready** on start HEAD **bc776027f59da07f24f6cf8beb530941bd7033ea** (verified before edit).

## Root cause (Gate B structure round 18, `bc776027`)

`restore_check.row_layout` on `flights-1280*.png`: Southwest rows **description does not fill the row** (e.g. 199 of 483 px). Gate B verdict `gateb-verdicts.jsonl` 2026-11-02T14:25:56-08:00, sha `bc77602`, gap_close FAIL on #547/#796.

After the QoRest split (airline-only `strong` in the logo–name pair), `QoRest` used `flex:"1 1 0"` beside the inline `data-ts-list-desc` span. QoRest grew and the description box stayed at intrinsic width (~199 px) instead of filling ≥60% of available row space (aaffa24 PASS used ~312/573 px on the same fixture row).

## Change (host publish)

| Path | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | `QoRest` outer wrapper: `flex:"0 1 auto"` + `maxWidth:"55%"` (upgrade needle from old `1 1 0` / `100%`) so price/times/route shrink-wrap; inline description keeps `flex:"1 1 0"` + `minWidth:"35%"` and absorbs remaining row width. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 **257a0bcc2c5a28c2fc4218d1078ced3ff08d85ae45832754d97f41441e83645c**). |

Untouched: row layout width constants on non-flight categories, `#471` logo–name pair, `data-ts-list-desc`, car Remove controls, tests/baselines/Gate B config.

## Checks (local, exit 0)

| Command | Ref |
| --- | --- |
| `node scripts/check-no-comments.mjs` | |
| `node scripts/test_offline_manifest.mjs` | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 fail |
| `node scripts/test_shared_tab_list_summary.mjs` | |
| `node scripts/test_gate_b_row_name_frame.mjs` | |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | |
| `cd apps/vacation-client && npm test` | |
| `node scripts/rebake_served_trek_bundle.mjs` | |

## Uncommitted (host only)

- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js`
- `J/RECEIPT.md` (this file)

Host: commit, push once, re-run Gate B structure on new head.
