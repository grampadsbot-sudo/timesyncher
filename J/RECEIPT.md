# vkfill-550 receipt — flight logo/name row fix (HOST LIVE ROW CHECK reject 2026-11-02 ~21:47 UTC)

## Outcome

**source-ready** on start HEAD **aaffa24023bb4625e77d731f5f81923fec04f401** (verified before edit).

## Root cause (Gate B structure, flights-* screens)

Host live row check failed **logo not centred with name** on Southwest flight rows: **missing visible name line (fail closed)** on `flights-390`, `flights-390-top`, `flights-1280`, `flights-1280-top` (capture `first_text` / `row-name-frame.mjs`).

Full flight row `Qo` (airline + price + times + route) lived inside `data-ts-list-row-name` within the 55% logo–name pair. Flex `width:0` on the airline cell collapsed the `<strong>` leaf to zero visible width, so capture recorded no measurable name line for logo vertical alignment.

## Change (host publish)

| Path | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Flights: `Zn` is airline-only `<strong>` in the name span; `QoRest` renders price/times/route beside the logo pair; thing-header inline wrap inserts `bn(G)?n.jsx(QoRest,{item:G})`; restore default `ua` strong wrap for #471. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 **89ba830a851920e09d9e0fa5c630174b7c1ff6038a6174264a6a6c6d4019cc70**). |

Untouched: row layout widths, `#471` logo–name pair markers, `data-ts-list-desc`, car remove controls, tests/baselines/Gate B config.

## Checks (local, exit 0)

| Command | Ref |
| --- | --- |
| `node scripts/check-no-comments.mjs` | |
| `node scripts/test_offline_manifest.mjs` | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 fail |
| `cd apps/vacation-client && npm test` | |
| `node scripts/test_gate_b_row_name_frame.mjs` | |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | |
| `node scripts/rebake_served_trek_bundle.mjs` | |

Note: `npm test` refreshed many `evidence/vacation-client-p2-*/*.png` locally; **not** part of the intended host publish set (only patch + rebaked bundle).

## Uncommitted (host only)

- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js`
- `J/RECEIPT.md` (this file)
