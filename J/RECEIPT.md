# vkfill-550 receipt (#547 flights-390 logo/name row fix)

## Outcome

**source-ready** on git HEAD **18548e1f68d882a845a2762b50d50586078bb084** (HOST LIVE ROW CHECK kickback: `flights-390.png` + `flights-390-top.png` Southwest logo not centred with name / missing visible name line).

## Fix (flights only)

Gate B capture picks the first leaf `span`/`strong` under `[data-ts-list-row-name]` for `first_text`. Flight rows used `Qo()` as a 4-column **grid** inside the thing-header name flex; at 390px the airline column could collapse to zero width (`visible: false` → fail closed).

**`src/vacation/shared-trip-oe-list-row-patch.mjs`**: `patchFlightQoAirlineNameFrame` — `Qo()` now uses **inline-flex** (like cars/hotels), wraps the airline in **`<strong>`** with `lineHeight:1` / `flexShrink:0`, keeps price + times on the same row.

**`public/assets/index-BKun7ofk.js`**: rebaked (`sha256=0d88712493ccdb1e4f7bf8c693cac5e7ac95ff911183f2005414895941ff40f3`, 6590643 bytes).

## Uncommitted (host publish)

| Path | Change |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | flight Qo inline-flex + airline strong for Gate B name line |
| `public/assets/index-BKun7ofk.js` | rebaked |
| `J/RECEIPT.md` | this receipt |

## Checks (local, uncommitted tree)

| Command | Exit | Ref |
| --- | --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 | sha256 above |
| `node scripts/test_shared_tab_list_summary.mjs` | 0 | HEAD **18548e1f** |
| `node scripts/test_served_trek_bundle.mjs` | 0 | |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | 0 | |
| `node scripts/test_gate_b_row_name_frame.mjs` | 0 | |
| `node scripts/check-no-comments.mjs` | 0 | |
| `node scripts/test_offline_manifest.mjs` | 0 | |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 | 0 fail |
| `cd apps/vacation-client && npm test` | 0 | HEAD **18548e1f** |
| `node --check public/assets/index-BKun7ofk.js` | 0 | |

Authority: host re-run Gate B structure on pushed build after publish (not Cursor self-proof).

## Left alone

Baselines, Gate B thresholds, other tabs, tests/asserts, host git mutations.
