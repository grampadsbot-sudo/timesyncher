# vkfill-549 round (list-layout Manhattan Club ink, 2026-11-02)

**Start sha:** `de5904cfc87559db8985e2528174dfeb0da581a0` (unchanged; host publish required)

## Root cause

PR #549 hotel list rows stack star rating under the name in `.tsv-row-title-stack`. The list-layout ink probe (`apps/vacation-client/test/list-layout.mjs`) compares logo-chip vertical center to the **first line** of `[data-ts-list-row-name="1"]`. Grid `align-items: center` on `.tsv-row-main` centered the chip against the full name+stars stack (~10px delta on row 608 / The Manhattan Club at 390 and 1280), failing `delta <= VACATION_CLIENT_ROW_INK_MAX` (0.5px default).

## Changes (uncommitted)

- **`apps/vacation-client/src/components/ListRow.tsx`**: hotel rows use `.tsv-row-hotel-head` — logo + name on grid row 1, stars on row 2 under the name column (same pattern as car head, without changing description/substance logic).
- **`apps/vacation-client/src/styles.css`**: `.tsv-row-hotel-head` grid rules so chip aligns with the name line only.

Layout test run refreshed `evidence/vacation-client-p2-*` PNGs locally; those were **reverted** — host should commit **only** the two source files above.

## Checks (local, CHROME_PATH=playwright chromium-1243)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | PASS (includes `list-layout.mjs` / shell layout) |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Left alone

Tests/thresholds, baselines, fixtures, trek bundle, Gate B config, deploy. No git commit in lane (HOST PUBLICATION ONLY).

**Host:** stage the two files above, commit on `cursor/tsv-546-known-gap-on-migrate-trek-source-description-substance-and-quality-4c4d`, push once; CI unit-tests on new tip should clear the prior `list-layout.mjs` Manhattan Club ink failure (`de5904cf`).
